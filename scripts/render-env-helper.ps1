# Affiche les variables a coller sur Render (Environment)
$jsonPath = Join-Path $PSScriptRoot "..\firebase-service-account.json"
if (-not (Test-Path $jsonPath)) {
  Write-Host "Fichier introuvable: $jsonPath"
  exit 1
}
$sa = Get-Content $jsonPath | ConvertFrom-Json
Write-Host ""
Write-Host "=== Variables Render (Environment) ==="
Write-Host ""
Write-Host "FIREBASE_PROJECT_ID"
Write-Host $sa.project_id
Write-Host ""
Write-Host "FIREBASE_CLIENT_EMAIL"
Write-Host $sa.client_email
Write-Host ""
Write-Host "FIREBASE_PRIVATE_KEY (copier toute la valeur, guillemets inclus si Render le demande)"
Write-Host $sa.private_key
Write-Host ""
Write-Host "Puis: Render > Manual Deploy > Deploy latest commit"
Write-Host ""
