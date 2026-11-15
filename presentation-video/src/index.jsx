import React from 'react';
import {AbsoluteFill, Composition, Img, OffthreadVideo, Series, registerRoot, staticFile, useVideoConfig} from 'remotion';

const Crop = ({src, start = 0, crop = [0, 0, 1918, 1078], width = 1920, height = 1080, rate = 1, still = false}) => {
  const {fps} = useVideoConfig();
  const [x,y,w,h] = crop;
  const scale = Math.min(width/w, height/h);
  const style = {position:'absolute', width:1918*scale, height:1078*scale, maxWidth:'none', left:-x*scale, top:-y*scale};
  return <div style={{position:'relative', width, height, overflow:'hidden',background:'#f7f8fa'}}>
    <div style={{position:'absolute',width:w*scale,height:h*scale,left:(width-w*scale)/2,top:(height-h*scale)/2,overflow:'hidden'}}>{still ? <Img src={staticFile(src)} style={style}/> : <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(start*fps)} playbackRate={rate} muted style={style} />}</div>
  </div>;
};
const Eye = () => <AbsoluteFill style={{display:'flex',flexDirection:'row',background:'#f7f8fa',alignItems:'center'}}>
  <Crop src="r1.mp4" start={195} crop={[60,100,340,900]} width={840}/>
  <Crop src="r1.mp4" start={195} crop={[1340,220,500,650]} width={1080}/>
</AbsoluteFill>;
const Chat = () => <AbsoluteFill style={{display:'flex',flexDirection:'row',background:'#f7f8fa',alignItems:'center'}}>
  <Crop src="r2.mp4" start={59} crop={[75,300,300,680]} width={800}/>
  <Crop src="r2.mp4" start={59} crop={[1340,110,500,740]} width={1120}/>
</AbsoluteFill>;
const Reply = () => <AbsoluteFill style={{display:'flex',flexDirection:'row',background:'#f7f8fa',alignItems:'center'}}>
  <Crop src="r1.mp4" start={277} crop={[60,600,310,430]} width={800}/>
  <Crop src="r1.mp4" start={277} crop={[1340,110,500,740]} width={1120}/>
</AbsoluteFill>;
const Demo = () => {
 const {fps} = useVideoConfig();
 return <AbsoluteFill style={{background:'#f7f8fa'}}><Series>
  <Series.Sequence name="Original logo" durationInFrames={3*fps} premountFor={fps}><Crop src="intro-poster.jpg" still/></Series.Sequence>
  <Series.Sequence name="Original entrance animation" durationInFrames={fps} premountFor={fps}><Crop src="intro.mp4"/></Series.Sequence>
  <Series.Sequence name="Male 3D dashboard" durationInFrames={4*fps} premountFor={fps}><Crop src="r1.mp4" start={0}/></Series.Sequence>
  <Series.Sequence name="Female 3D dashboard" durationInFrames={3*fps} premountFor={fps}><Crop src="r1.mp4" start={32}/></Series.Sequence>
  <Series.Sequence name="Vital measurements" durationInFrames={3*fps} premountFor={fps}><Crop src="r1.mp4" start={7}/></Series.Sequence>
  <Series.Sequence name="Sleep data" durationInFrames={2*fps} premountFor={fps}><Crop src="r1.mp4" start={73}/></Series.Sequence>
  <Series.Sequence name="Onboard assistant overview" durationInFrames={3*fps} premountFor={fps}><Crop src="r1.mp4" start={193}/></Series.Sequence>
  <Series.Sequence name="Live eyelid tracking" durationInFrames={8*fps} premountFor={fps}><Eye/></Series.Sequence>
  <Series.Sequence name="Astronaut check-in" durationInFrames={8*fps} premountFor={fps}><Chat/></Series.Sequence>
  <Series.Sequence name="Agent reply" durationInFrames={4*fps} premountFor={fps}><Reply/></Series.Sequence>
  <Series.Sequence name="Check-in review" durationInFrames={4*fps} premountFor={fps}><Crop src="r2.mp4" start={125} crop={[1320,100,520,950]}/></Series.Sequence>
  <Series.Sequence name="Houston speech and sensor report" durationInFrames={4*fps} premountFor={fps}><Crop src="report-optical.jpg" still crop={[180,155,1540,895]}/></Series.Sequence>
  <Series.Sequence name="Report provenance" durationInFrames={3*fps} premountFor={fps}><Crop src="report.jpg" still crop={[180,620,1540,450]}/></Series.Sequence>
  <Series.Sequence name="Applied proposal status" durationInFrames={4*fps} premountFor={fps}><Crop src="applied.jpg" still crop={[180,290,1540,450]}/></Series.Sequence>
  <Series.Sequence name="Updated daily schedule" durationInFrames={4*fps} premountFor={fps}><Crop src="schedule.jpg" still crop={[180,20,1540,970]}/></Series.Sequence>
 </Series></AbsoluteFill>;
};
registerRoot(() => <Composition id="SlothDemo" component={Demo} durationInFrames={1740} fps={30} width={1920} height={1080}/>);
