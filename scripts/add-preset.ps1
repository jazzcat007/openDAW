$now = 1788412479730
$indexPath = 'T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw\factory\presets\index.json'
$json = Get-Content $indexPath | ConvertFrom-Json

$new = [PSCustomObject]@{
    uuid = '90543104-f81b-4b9a-b9c8-096b4c017327'
    name = 'Sidechain-Style Pump'
    category = 'audio-effect-chain'
    description = 'Fast compressor into a saturator for a pumping effect. Side-chain routing requires a second track/bus in a project; this preset provides the aggressive compression/saturation character without external side-chain input.'
    created = $now
    modified = $now
}

$list = @($json)
$list += $new
$list | ConvertTo-Json -Depth 10 | Set-Content $indexPath -Encoding UTF8

Write-Host 'Added preset, total count:' $list.Count
