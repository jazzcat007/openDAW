$j = Get-Content T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw\factory\presets\index.json | ConvertFrom-Json
Write-Host 'Total entries:' $j.Count
foreach($p in $j){ Write-Host '- ' $p.name ' (' $p.category ')' }
