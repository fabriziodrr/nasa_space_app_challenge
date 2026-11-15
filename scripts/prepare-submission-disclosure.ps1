$ErrorActionPreference = 'Stop'
$slothRoot = Split-Path -Parent $PSScriptRoot
$slothApp = $null
$slothDeck = $null
try {
    $slothApp = New-Object -ComObject PowerPoint.Application
    $slothDeck = $slothApp.Presentations.Open((Join-Path $slothRoot 'output/presentation/SLOTH_presentazione_corretto.pptx'), $true, $false, $false)
    $slothWidth = $slothDeck.PageSetup.SlideWidth
    $slothHeight = $slothDeck.PageSetup.SlideHeight
    $slothDeck.Slides.Item(1).Shapes.Item('NASA Space Apps logo').Delete()
    foreach ($slothSlide in $slothDeck.Slides) {
        $slothLabel = $slothSlide.Shapes.AddTextbox(1, $slothWidth - 306, $slothHeight - 22, 300, 18)
        $slothLabel.Name = 'SI disclosure watermark'
        $slothLabel.Fill.Visible = -1
        $slothLabel.Fill.ForeColor.RGB = 2168840
        $slothLabel.Line.Visible = 0
        $slothLabel.TextFrame.MarginLeft = 5
        $slothLabel.TextFrame.MarginRight = 5
        $slothLabel.TextFrame.MarginTop = 2
        $slothLabel.TextFrame.MarginBottom = 1
        $slothLabel.TextFrame.TextRange.Text = if ($slothSlide.SlideIndex -in 1,3,4) { 'Contains SI-generated visuals | AI-assisted presentation' } else { 'AI-assisted presentation | See project AI-use disclosure' }
        $slothLabel.TextFrame.TextRange.Font.Name = 'Arial'
        $slothLabel.TextFrame.TextRange.Font.Size = 9
        $slothLabel.TextFrame.TextRange.Font.Color.RGB = 16777215
    }
    $slothDeck.Tags.Add('AI_USE', 'SI-generated visuals; AI-assisted text, code and synthetic demo data; AI-generated assistant text and synthetic voice.')
    $slothDeck.SaveAs((Join-Path $slothRoot 'output/presentation/SLOTH_submission.pptx'), 24)
    $slothDeck.SaveAs((Join-Path $slothRoot 'output/presentation/SLOTH_submission.pdf'), 32)
    $slothReview = Join-Path $slothRoot 'tmp/sloth-si-review'
    New-Item -ItemType Directory -Force $slothReview | Out-Null
    foreach ($slothSlide in $slothDeck.Slides) {
        $slothSlide.Export((Join-Path $slothReview ('slide-' + $slothSlide.SlideIndex + '.png')), 'PNG', 1280, 720)
    }
    Write-Output ('Exported ' + $slothDeck.Slides.Count + ' slides and PDF with disclosure.')
} finally {
    if ($slothDeck) { $slothDeck.Close() }
    if ($slothApp) { $slothApp.Quit() }
}
