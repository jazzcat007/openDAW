$root = 'T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw\factory'
Get-ChildItem $root -Directory | ForEach-Object { Write-Host $_.Name }
