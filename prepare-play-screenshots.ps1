Add-Type -AssemblyName System.Drawing

function Convert-ToPlayPhoneScreenshot {
  param(
    [Parameter(Mandatory=$true)][string]$InputPath,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [int]$TargetWidth = 1080,
    [int]$TargetHeight = 1920,
    [int]$JpegQuality = 90
  )

  if (-not (Test-Path $InputPath)) {
    throw "Input not found: $InputPath"
  }

  # Load source
  $src = [System.Drawing.Image]::FromFile($InputPath)
  try {
    $srcW = $src.Width
    $srcH = $src.Height
    $targetRatio = [double]$TargetWidth / [double]$TargetHeight

    # Compute crop rect to match target aspect ratio (9:16) without stretching.
    $desiredH = [int][Math]::Round($srcW / $targetRatio)
    if ($desiredH -le $srcH) {
      # Crop top/bottom
      $cropY = [int][Math]::Round(($srcH - $desiredH) / 2.0)
      $cropRect = New-Object System.Drawing.Rectangle(0, $cropY, $srcW, $desiredH)
    } else {
      # Crop left/right
      $desiredW = [int][Math]::Round($srcH * $targetRatio)
      $cropX = [int][Math]::Round(($srcW - $desiredW) / 2.0)
      $cropRect = New-Object System.Drawing.Rectangle($cropX, 0, $desiredW, $srcH)
    }

    # Crop
    $cropped = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
    $gCrop = [System.Drawing.Graphics]::FromImage($cropped)
    try {
      $gCrop.DrawImage(
        $src,
        (New-Object System.Drawing.Rectangle(0, 0, $cropRect.Width, $cropRect.Height)),
        $cropRect,
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally {
      $gCrop.Dispose()
    }

    # Resize to target
    $resized = New-Object System.Drawing.Bitmap($TargetWidth, $TargetHeight)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    try {
      $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.DrawImage($cropped, (New-Object System.Drawing.Rectangle(0, 0, $TargetWidth, $TargetHeight)))
    } finally {
      $g.Dispose()
    }

    # Save as JPEG with quality
    $encoders = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()
    $jpegEncoder = $encoders | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1

    $qualityParam = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $JpegQuality)
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = $qualityParam

    $resized.Save($OutputPath, $jpegEncoder, $encoderParams)
  } finally {
    $src.Dispose()
  }
}

$assetsDir = "C:\Users\areil\.cursor\projects\c-Users-areil-Desktop-meetmap\assets"

# These are the 2 portrait app screenshots you uploaded (the third you sent looks like a Play Console placeholder).
$inputs = @(
  "C:\Users\areil\.cursor\projects\c-Users-areil-Desktop-meetmap\assets\c__Users_areil_AppData_Roaming_Cursor_User_workspaceStorage_79a5c5ea86f6e72d8925afd2026fd6fc_images_Screenshot_20260320-062941-9ef9e9ae-6b15-4ce7-9992-5780a2cd6314.png",
  "C:\Users\areil\.cursor\projects\c-Users-areil-Desktop-meetmap\assets\c__Users_areil_AppData_Roaming_Cursor_User_workspaceStorage_79a5c5ea86f6e72d8925afd2026fd6fc_images_Screenshot_20260320-063001-51680ec8-b05d-416e-9ed6-9288e955b5b1.png"
)

for ($i = 0; $i -lt $inputs.Length; $i++) {
  $inPath = $inputs[$i]
  $outPath = Join-Path $assetsDir ("play_phone_1080x1920_portrait_{0}.jpg" -f ($i+1))
  Convert-ToPlayPhoneScreenshot -InputPath $inPath -OutputPath $outPath
  Write-Output "Wrote: $outPath"
}

