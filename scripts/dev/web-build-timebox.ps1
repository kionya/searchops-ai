param(
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

$job = Start-Job -ScriptBlock {
  param($RepoRoot)

  Set-Location -LiteralPath $RepoRoot
  corepack pnpm --filter @searchops/web build
  if ($LASTEXITCODE -ne 0) {
    throw "web build exited with code $LASTEXITCODE"
  }
} -ArgumentList $repoRoot

$finished = Wait-Job -Job $job -Timeout $TimeoutSeconds

if ($null -eq $finished) {
  Stop-Job -Job $job -ErrorAction SilentlyContinue
  Receive-Job -Job $job -Keep
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  Write-Error "web build timed out after $TimeoutSeconds seconds"
  exit 124
}

Receive-Job -Job $job

if ($job.State -ne "Completed") {
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  exit 1
}

Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
