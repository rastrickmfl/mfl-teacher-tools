# Rebuilds starter-content.json: the list of Sentence Builders and Waypoints that ship with the app.
# Run from anywhere:  powershell -File tools\make-starter-manifest.ps1
# Bump the version whenever the list changes so existing users get the new files.
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'starter-content.json'
$version = 1
if (Test-Path $manifestPath) { $version = [int](Get-Content $manifestPath -Raw | ConvertFrom-Json).version + 1 }
$files = foreach ($dir in 'Sentence Builders', 'Waypoints') {
  Get-ChildItem -LiteralPath (Join-Path $root $dir) -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.Bin\\' } |
    ForEach-Object { $_.FullName.Substring($root.Length + 1).Replace('\', '/') }
}
$json = [ordered]@{ version = $version; files = @($files | Sort-Object) } | ConvertTo-Json -Depth 3
[IO.File]::WriteAllText($manifestPath, $json, (New-Object Text.UTF8Encoding $false))
"Wrote $manifestPath (version $version, $(@($files).Count) files)"
