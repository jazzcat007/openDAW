$factoryIndexPath = 'T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw\factory\presets\index.json'
$stagedIndexPath = 't:\Development\OpenDAW\factory-staging\intake\presets\index.json'

$factory = Get-Content $factoryIndexPath | ConvertFrom-Json
$staged = Get-Content $stagedIndexPath | ConvertFrom-Json

$factoryMap = @{}
foreach($p in $factory){ $factoryMap[$p.uuid] = $p }

$changed = $false
foreach($p in $staged){
    if(-not $factoryMap.ContainsKey($p.uuid)){
        $factory += $p
        $changed = $true
    } else {
        # update if modified newer
        if($p.modified -gt $factoryMap[$p.uuid].modified){
            $idx = [Array]::IndexOf($factory, $factoryMap[$p.uuid])
            $factory[$idx] = $p
            $changed = $true
        }
    }
}

if($changed){
    $factory | ConvertTo-Json -Depth 10 | Set-Content $factoryIndexPath -Encoding UTF8
    Write-Host 'Merged staged presets into factory. Total:' $factory.Count
} else {
    Write-Host 'No changes. Factory count:' $factory.Count
}
