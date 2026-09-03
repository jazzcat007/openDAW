$root = 'T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw\factory'
Get-ChildItem $root -Recurse -Filter index.json | ForEach-Object {
    Write-Host '---' $_.FullName
    $j = Get-Content $_.FullName | ConvertFrom-Json
    Write-Host 'Count:' $j.Count
    if($j.Count -gt 0){ $j | ForEach-Object { Write-Host '  ' $_.name } }
}
