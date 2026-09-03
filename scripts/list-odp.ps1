$files = Get-ChildItem T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw\factory\presets -Filter *.odp
foreach($f in $files){
    Write-Host $f.Name $f.Length
}
Write-Host 'Total ODP files:' $files.Count
