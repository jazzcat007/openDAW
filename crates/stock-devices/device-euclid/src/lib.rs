//! Euclid MIDI effect: a transport-synced Euclidean pattern generator.
//!
//! The device passes upstream MIDI through unchanged and emits its own note stream on a musical rate grid.

#![cfg_attr(target_family = "wasm", no_std)]

#[cfg(target_family = "wasm")]
use core::panic::PanicInfo;
use abi::{EventRecord, ParamValue, EVENT_NOTE_OFF, EVENT_NOTE_ON};
use math::value_mapping::{Linear, LinearInteger};

#[cfg(target_family = "wasm")]
#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    abi::panic_to_host(info)
}

const BAR: i64 = 3840;
const RATE_FRACTIONS: [(i64, i64); 17] = [
    (1, 1), (1, 2), (1, 3), (1, 4), (3, 16), (1, 6), (1, 8), (3, 32), (1, 12),
    (1, 16), (3, 64), (1, 24), (1, 32), (1, 48), (1, 64), (1, 96), (1, 128)
];

const STEPS_FIELD: [u16; 1] = [10];
const PULSES_FIELD: [u16; 1] = [11];
const ROTATION_FIELD: [u16; 1] = [12];
const RATE_FIELD: [u16; 1] = [13];
const GATE_FIELD: [u16; 1] = [14];
const PITCH_FIELD: [u16; 1] = [15];
const VELOCITY_FIELD: [u16; 1] = [16];

const STEPS_MAPPING: LinearInteger = LinearInteger {min: 1, max: 64};
const PULSES_MAPPING: LinearInteger = LinearInteger {min: 0, max: 64};
const ROTATION_MAPPING: LinearInteger = LinearInteger {min: -64, max: 64};
const RATE_MAPPING: LinearInteger = LinearInteger {min: 0, max: (RATE_FRACTIONS.len() - 1) as i32};
const GATE_MAPPING: Linear = Linear {min: 0.0, max: 2.0};
const PITCH_MAPPING: LinearInteger = LinearInteger {min: 0, max: 127};
const VELOCITY_MAPPING: Linear = Linear::unipolar();

const MAX_RETAINED: usize = 128;
const MAX_EVENTS: usize = 256;
const PULL_SCRATCH: usize = 256;

#[derive(Clone, Copy)]
struct Retained {
    id: u32,
    pitch: u32,
    complete: f64
}

pub struct EuclidState {
    retained: [Retained; MAX_RETAINED],
    retained_count: u32,
    next_id: u32,
    steps: i32,
    pulses: i32,
    rotation: i32,
    rate: f64,
    gate: f32,
    pitch: i32,
    velocity: f32,
    steps_id: u32,
    pulses_id: u32,
    rotation_id: u32,
    rate_id: u32,
    gate_id: u32,
    pitch_id: u32,
    velocity_id: u32
}

fn blank() -> EventRecord {
    EventRecord {position: 0.0, offset: 0, kind: 0, id: 0, pitch: 0, velocity: 0.0, cent: 0.0, duration: 0.0}
}

fn rate_ppqn(index: i32) -> f64 {
    let clamped = if index < 0 { 0 } else if index as usize >= RATE_FRACTIONS.len() { RATE_FRACTIONS.len() - 1 } else { index as usize };
    let (numerator, denominator) = RATE_FRACTIONS[clamped];
    ((BAR / denominator) * numerator) as f64
}

fn first_index(from: f64, rate: f64) -> i64 {
    let index = (from / rate) as i64;
    if (index as f64) * rate < from {
        index + 1
    } else {
        index
    }
}

fn rotated_step(index: i64, steps: i32, rotation: i32) -> i32 {
    let steps = steps.max(1) as i64;
    let step = (index - rotation as i64).rem_euclid(steps);
    step as i32
}

fn is_hit(index: i64, steps: i32, pulses: i32, rotation: i32) -> bool {
    let steps = steps.max(1);
    let pulses = pulses.clamp(0, steps);
    if pulses == 0 {
        return false;
    }
    let step = rotated_step(index, steps, rotation);
    (step * pulses).rem_euclid(steps) < pulses
}

fn emit(events: &mut [EventRecord], count: &mut usize, event: EventRecord) {
    if *count < events.len() {
        events[*count] = event;
        *count += 1;
    }
}

fn note_off(id: u32, pitch: u32, position: f64) -> EventRecord {
    EventRecord {position, offset: 0, kind: EVENT_NOTE_OFF, id, pitch, velocity: 0.0, cent: 0.0, duration: 0.0}
}

fn lifecycle_rank(event: &EventRecord) -> u8 {
    if event.kind == EVENT_NOTE_ON { 0 } else if event.kind == EVENT_NOTE_OFF { 1 } else { 2 }
}

fn release_completed(state: &mut EuclidState, to: f64, events: &mut [EventRecord], count: &mut usize) {
    let mut index = 0;
    while index < state.retained_count as usize {
        let retained = state.retained[index];
        if retained.complete < to {
            emit(events, count, note_off(retained.id, retained.pitch, retained.complete));
            state.retained[index] = state.retained[state.retained_count as usize - 1];
            state.retained_count -= 1;
        } else {
            index += 1;
        }
    }
}

pub fn seed(state: &mut EuclidState) {
    state.next_id = 1;
    state.steps = 16;
    state.pulses = 4;
    state.rotation = 0;
    state.rate = rate_ppqn(9);
    state.gate = 0.75;
    state.pitch = 60;
    state.velocity = 0.8;
    state.steps_id = abi::bind_parameter(&STEPS_FIELD);
    state.pulses_id = abi::bind_parameter(&PULSES_FIELD);
    state.rotation_id = abi::bind_parameter(&ROTATION_FIELD);
    state.rate_id = abi::bind_parameter(&RATE_FIELD);
    state.gate_id = abi::bind_parameter(&GATE_FIELD);
    state.pitch_id = abi::bind_parameter(&PITCH_FIELD);
    state.velocity_id = abi::bind_parameter(&VELOCITY_FIELD);
}

fn apply_parameter(state: &mut EuclidState, id: u32, value: ParamValue) {
    if id == state.steps_id {
        state.steps = abi::int_value(value, &STEPS_MAPPING);
        state.pulses = state.pulses.clamp(0, state.steps);
    } else if id == state.pulses_id {
        state.pulses = abi::int_value(value, &PULSES_MAPPING).clamp(0, state.steps.max(1));
    } else if id == state.rotation_id {
        state.rotation = abi::int_value(value, &ROTATION_MAPPING);
    } else if id == state.rate_id {
        state.rate = rate_ppqn(abi::int_value(value, &RATE_MAPPING));
    } else if id == state.gate_id {
        state.gate = abi::float_value(value, &GATE_MAPPING);
    } else if id == state.pitch_id {
        state.pitch = abi::int_value(value, &PITCH_MAPPING);
    } else if id == state.velocity_id {
        state.velocity = abi::float_value(value, &VELOCITY_MAPPING);
    }
}

pub fn process(state: &mut EuclidState, from: f64, to: f64, flags: u32, input: &[EventRecord], out: &mut [EventRecord]) -> usize {
    let mut events = [blank(); MAX_EVENTS];
    let mut count = 0;
    let discontinuous = flags & abi::BlockFlags::DISCONTINUOUS != 0;
    let transporting = flags & abi::BlockFlags::TRANSPORTING != 0;
    if discontinuous {
        let mut index = 0;
        while index < state.retained_count as usize {
            let retained = state.retained[index];
            emit(&mut events, &mut count, note_off(retained.id, retained.pitch, from));
            index += 1;
        }
        state.retained_count = 0;
    } else {
        release_completed(state, to, &mut events, &mut count);
    }
    for event in input {
        emit(&mut events, &mut count, *event);
    }
    if transporting && state.rate > 0.0 {
        let duration = (state.rate * state.gate.max(0.0) as f64).max(1.0);
        let mut index = first_index(from, state.rate);
        let mut position = index as f64 * state.rate;
        while position < to {
            if is_hit(index, state.steps, state.pulses, state.rotation) && (state.retained_count as usize) < MAX_RETAINED {
                let id = state.next_id;
                state.next_id = state.next_id.wrapping_add(1).max(1);
                emit(&mut events, &mut count, EventRecord {
                    position,
                    offset: 0,
                    kind: EVENT_NOTE_ON,
                    id,
                    pitch: state.pitch.clamp(0, 127) as u32,
                    velocity: state.velocity.clamp(0.0, 1.0),
                    cent: 0.0,
                    duration
                });
                state.retained[state.retained_count as usize] = Retained {id, pitch: state.pitch.clamp(0, 127) as u32, complete: position + duration};
                state.retained_count += 1;
            }
            index += 1;
            position = index as f64 * state.rate;
        }
    }
    release_completed(state, to, &mut events, &mut count);
    events[..count].sort_unstable_by(|left, right| {
        left.position.partial_cmp(&right.position).unwrap_or(core::cmp::Ordering::Equal).then(lifecycle_rank(left).cmp(&lifecycle_rank(right)))
    });
    let written = count.min(out.len());
    out[..written].copy_from_slice(&events[..written]);
    written
}

#[no_mangle]
pub extern "C" fn kind() -> u32 {
    abi::DEVICE_KIND_MIDI_EFFECT
}

#[no_mangle]
pub extern "C" fn state_size(_sample_rate: f32) -> u32 {
    core::mem::size_of::<EuclidState>() as u32
}

#[no_mangle]
pub extern "C" fn init(state_ptr: u32, _sample_rate: f32) {
    seed(unsafe { &mut *(state_ptr as *mut EuclidState) });
}

#[no_mangle]
pub extern "C" fn parameter_changed(state_ptr: u32, id: u32, kind: u32, value: f32, modulation: f32) {
    let value = ParamValue::from_wire(kind, value, modulation);
    unsafe { abi::with_state(state_ptr, |state| apply_parameter(state, id, value)) }
}

#[no_mangle]
pub extern "C" fn process_events(from: f64, to: f64, flags: u32, state_ptr: u32, out_ptr: u32, max: u32) -> u32 {
    let state = unsafe { &mut *(state_ptr as *mut EuclidState) };
    let mut scratch = [blank(); PULL_SCRATCH];
    let pulled = abi::pull_events(from, to, flags, &mut scratch);
    let out = unsafe { core::slice::from_raw_parts_mut(out_ptr as *mut EventRecord, max as usize) };
    process(state, from, to, flags, &scratch[..pulled], out) as u32
}

#[no_mangle]
pub extern "C" fn map_parameter(id: u32, unit: f32) -> f32 {
    let value = ParamValue::Unit(unit);
    match id {
        0 => abi::int_value(value, &STEPS_MAPPING) as f32,
        1 => abi::int_value(value, &PULSES_MAPPING) as f32,
        2 => abi::int_value(value, &ROTATION_MAPPING) as f32,
        3 => abi::int_value(value, &RATE_MAPPING) as f32,
        4 => abi::float_value(value, &GATE_MAPPING),
        5 => abi::int_value(value, &PITCH_MAPPING) as f32,
        6 => abi::float_value(value, &VELOCITY_MAPPING),
        _ => f32::NAN
    }
}

#[no_mangle]
pub extern "C" fn reset(state_ptr: u32) {
    unsafe { abi::with_state(state_ptr, |state: &mut EuclidState| state.retained_count = 0) }
}
