# S.L.O.T.H. presentation video

Editable Remotion montage, 58 seconds, 16:9, silent. The source recordings contain different demo sessions: the montage illustrates features and does not present them as one continuous clinical assessment. The applied-status shot shows an existing applied proposal, not a newly filmed approval click.

Final presentation file: `out/sloth-presentation.mp4` (1280×720, 30 fps, H.264, 58 seconds, no audio). The final file was fully decoded without errors. The opening was rendered again in Remotion to hold the original logo for three seconds, and joined to the remaining Remotion render with FFmpeg; the editable composition contains that corrected opening.

Sources in `public/`: `r1.mp4`, `r2.mp4`, and `intro.mp4` (the earlier recording, used for the brief original logo animation). The additional JPG files are unaltered frames extracted from r2, held briefly for readability.

Timeline: logo 0–4s; male model 4–8s; female model 8–11s; vitals 11–14s; sleep 14–16s; assistant overview 16–19s; eyelid tracking 19–27s; astronaut message 27–35s; assistant response 35–39s; check-in review 39–43s; report 43–50s; applied status 50–54s; schedule 54–58s.

Run `npm run studio` for the editable preview on port 3100. Run `npm run render` to export a full-size version. This workstation uses `--browser-executable="C:\Program Files\Google\Chrome\Application\chrome.exe"` for rendering. The presentation export uses `--scale=0.6666666666666666` for a 1280×720 file. No audio is included. Original files are retained unchanged.

`public/`, render outputs, analysis images and dependencies are ignored in this subproject. Keep a copy of the source recordings if you want to rebuild the montage on another computer.
