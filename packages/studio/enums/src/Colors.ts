import {Color} from "@opendaw/lib-std"

export const Colors = {
    white: new Color(0, 0, 100),
    blue: new Color(187, 100, 63),
    green: new Color(158, 88, 62),
    yellow: new Color(51, 100, 72),
    cream: new Color(38, 64, 86),
    orange: new Color(28, 100, 66),
    red: new Color(350, 100, 64),
    purple: new Color(309, 100, 68),
    bright: new Color(205, 28, 94),
    gray: new Color(214, 38, 80),
    dark: new Color(226, 22, 60),
    shadow: new Color(244, 17, 43),
    black: new Color(252, 31, 18),
    background: new Color(258, 42, 7),
    panelBackground: new Color(254, 38, 10),
    panelBackgroundBright: new Color(248, 30, 17),
    panelBackgroundDark: new Color(262, 43, 6)
}

export const initializeColors = (root: { style: { setProperty: (name: string, value: string) => void } }) => {
    Object.entries(Colors).forEach(([name, value]) => {
        const cssName = name.replace(/([A-Z])/g, "-$1").toLowerCase()
        root.style.setProperty(`--color-${cssName}`, value.toString())
    })
}
