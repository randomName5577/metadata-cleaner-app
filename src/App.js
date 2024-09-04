import React, { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import './App.css';

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [options, setOptions] = useState({
    changeMetadata: { enabled: true, title: '', artist: '', album: '', year: '' },
    changeVideoICC: { enabled: true },
    changeExifData: { enabled: true },
    changeMD5Hash: { enabled: true },
    changeSaturation: { enabled: true, value: 1 },
    randomSplits: { enabled: true, count: 2 },
    trimVideoStart: { enabled: true, value: 0 },
    trimVideoEnd: { enabled: true, value: 0 },
    voiceChanger: { enabled: true, pitch: 0.9 },
    changeHSLLightness: { enabled: true, value: 0 },
    changeFrameRate: { enabled: true, value: 30 },
    addSticker: { enabled: true, size: 10 },
    changeAudioBitrate: { enabled: true, value: 128 },
    changeVideoBitrate: { enabled: true, value: 1000 },
    changeResolution: { enabled: true, width: 1080, height: 1920 },
  });
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [currentStats, setCurrentStats] = useState('');
  const [beforeStats, setBeforeStats] = useState('');
  const [afterStats, setAfterStats] = useState('');
  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(new FFmpeg());

  const loadFFmpeg = async () => {
    const ffmpeg = ffmpegRef.current;
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    setReady(true);
  };

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    setVideoFile(file);
    if (file) {
      const stats = await getFileStats(file);
      setCurrentStats(JSON.stringify(stats, null, 2));
    }
  };

  const handleOptionChange = (option, value) => {
    setOptions((prevOptions) => ({
      ...prevOptions,
      [option]: { ...prevOptions[option], enabled: value },
    }));
  };

  const handleValueChange = (option, key, value) => {
    setOptions((prevOptions) => ({
      ...prevOptions,
      [option]: { ...prevOptions[option], [key]: value },
    }));
  };

  const getFileStats = async (file) => {
    const ffmpeg = ffmpegRef.current;
    await ffmpeg.writeFile(file.name, await fetchFile(file));

    await ffmpeg.exec(['-i', file.name, '-show_streams', '-show_format', '-of', 'json']);
    const statsJson = await ffmpeg.readFile('out.json');
    const stats = JSON.parse(new TextDecoder().decode(statsJson));

    // Calculate additional metadata
    const videoStream = stats.streams.find(s => s.codec_type === 'video');
    const audioStream = stats.streams.find(s => s.codec_type === 'audio');

    const metadata = {
      filename: file.name,
      filesize: file.size,
      format: stats.format.format_name,
      duration: parseFloat(stats.format.duration).toFixed(2) + ' seconds',
      bitrate: parseInt(stats.format.bit_rate) / 1000 + ' kbps',
      videoCodec: videoStream?.codec_name,
      resolution: `${videoStream?.width}x${videoStream?.height}`,
      aspectRatio: videoStream?.display_aspect_ratio,
      frameRate: parseFloat(videoStream?.r_frame_rate).toFixed(2),
      videoBitrate: videoStream?.bit_rate ? parseInt(videoStream.bit_rate) / 1000 + ' kbps' : 'N/A',
      audioCodec: audioStream?.codec_name,
      sampleRate: audioStream?.sample_rate + ' Hz',
      channels: audioStream?.channels,
      audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 + ' kbps' : 'N/A',
      iccProfile: stats.format.tags?.icc_profile || 'Not available',
      exifData: JSON.stringify(stats.format.tags || {}, null, 2),
    };

    // Calculate MD5 hash
    await ffmpeg.exec(['-i', file.name, '-f', 'md5', '-']);
    const md5Hash = await ffmpeg.readFile('out.md5');
    metadata.md5Hash = new TextDecoder().decode(md5Hash).trim();

    return metadata;
  };

  const getVideoStats = async (ffmpeg, fileName) => {
    await ffmpeg.exec(['-i', fileName, '-show_streams', '-show_format', '-of', 'json']);
    const statsJson = await ffmpeg.readFile('out.json');
    return new TextDecoder().decode(statsJson);
  };

  const processVideo = async () => {
    setMessage('Processing video...');
    const ffmpeg = ffmpegRef.current;
    const inputFileName = 'input.mp4';
    const outputFileName = 'output.mp4';
    
    await ffmpeg.writeFile(inputFileName, await fetchFile(videoFile));

    // Get before stats
    const beforeStatsJson = await getVideoStats(ffmpeg, inputFileName);
    setBeforeStats(beforeStatsJson);

    let filterComplex = '';
    let inputOptions = '';
    let outputOptions = '';

    if (options.changeMetadata.enabled) {
      const { title, artist, album, year } = options.changeMetadata;
      outputOptions += ` -metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -metadata year="${year}"`;
    }

    if (options.changeSaturation.enabled) {
      filterComplex += `[0:v]eq=saturation=${options.changeSaturation.value}[v];`;
    }

    if (options.changeHSLLightness.enabled) {
      filterComplex += `[v]hue=lightness=${options.changeHSLLightness.value / 100}[v];`;
    }

    if (options.changeFrameRate.enabled) {
      outputOptions += ` -r ${options.changeFrameRate.value}`;
    }

    if (options.trimVideoStart.enabled || options.trimVideoEnd.enabled) {
      const durationResult = await ffmpeg.exec(['-i', inputFileName, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0']);
      const duration = parseFloat(new TextDecoder().decode(durationResult).split('\n')[0]);
      
      if (options.trimVideoStart.enabled) {
        inputOptions += ` -ss ${options.trimVideoStart.value}`;
      }
      
      if (options.trimVideoEnd.enabled) {
        outputOptions += ` -to ${Math.max(0, duration - options.trimVideoEnd.value)}`;
      }
    }

    if (options.voiceChanger.enabled) {
      filterComplex += `[0:a]asetrate=44100*${options.voiceChanger.pitch},aresample=44100[a];`;
    }

    if (options.addSticker.enabled) {
      await ffmpeg.exec(['-f', 'lavfi', '-i', `color=c=white@0.01:s=${options.addSticker.size}x${options.addSticker.size}:r=1`, '-vframes', '1', 'sticker.png']);
      filterComplex += `[v][1:v]overlay=10:10[v];`;
      inputOptions += ' -i sticker.png';
    }

    if (options.changeAudioBitrate.enabled) {
      outputOptions += ` -b:a ${options.changeAudioBitrate.value}k`;
    }

    if (options.changeVideoBitrate.enabled) {
      outputOptions += ` -b:v ${options.changeVideoBitrate.value}k`;
    }

    if (options.changeResolution.enabled) {
      outputOptions += ` -vf scale=${options.changeResolution.width}:${options.changeResolution.height}`;
    }

    if (options.randomSplits.enabled) {
      const durationResult = await ffmpeg.exec(['-i', inputFileName, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0']);
      const duration = parseFloat(new TextDecoder().decode(durationResult).split('\n')[0]);
      const splitPoints = Array.from({length: options.randomSplits.count - 1}, () => Math.random() * duration).sort((a, b) => a - b);
      
      let splitCommand = `-i ${inputFileName} ${inputOptions} ${filterComplex}`;
      splitPoints.forEach((point, index) => {
        splitCommand += ` -t ${point} -c copy split_${index}.mp4`;
      });
      splitCommand += ` -t ${duration} -c copy split_${options.randomSplits.count - 1}.mp4`;
      
      await ffmpeg.exec(splitCommand.split(' '));
      setMessage('Video processing complete. Multiple split files have been created.');
      return;
    }

    if (filterComplex) {
      filterComplex = `-filter_complex "${filterComplex.slice(0, -1)}"`;
    }

    const command = `-i ${inputFileName} ${inputOptions} ${filterComplex} ${outputOptions} -c:a aac -b:a 128k ${outputFileName}`.split(' ');
    
    await ffmpeg.exec(command);

    // Get after stats
    const afterStatsJson = await getVideoStats(ffmpeg, outputFileName);
    setAfterStats(afterStatsJson);

    const data = await ffmpeg.readFile(outputFileName);
    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    setMessage('Video processing complete. Download the result below.');
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed_video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const renderTooltip = (text) => (
    <span className="tooltip" title={text}>?</span>
  );

  return (
    <div className="App">
      <header className="App-header">
        <h1>Metadata Cleaner</h1>
      </header>
      <main>
        <div className="upload-section">
          <input
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            ref={fileInputRef}
            id="file-input"
          />
          <label htmlFor="file-input">Choose Video File</label>
          {videoFile && <p>Selected file: {videoFile.name}</p>}
        </div>
        {currentStats && (
          <div className="stats-section">
            <h3>Current File Stats:</h3>
            <pre>{currentStats}</pre>
          </div>
        )}
        <div className="options-section">
          <h2>Processing Options</h2>
          {Object.entries(options).map(([option, value]) => (
            <div key={option} className="option">
              <label>
                <input
                  type="checkbox"
                  checked={value.enabled}
                  onChange={(e) => handleOptionChange(option, e.target.checked)}
                />
                {option.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
              </label>
              {renderTooltip(getTooltipText(option))}
              {option === 'changeMetadata' && value.enabled && (
                <div className="metadata-inputs">
                  <input
                    type="text"
                    placeholder="Title"
                    value={value.title}
                    onChange={(e) => handleValueChange(option, 'title', e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Artist"
                    value={value.artist}
                    onChange={(e) => handleValueChange(option, 'artist', e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Album"
                    value={value.album}
                    onChange={(e) => handleValueChange(option, 'album', e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Year"
                    value={value.year}
                    onChange={(e) => handleValueChange(option, 'year', e.target.value)}
                  />
                </div>
              )}
              {option === 'randomSplits' && (
                <input
                  type="number"
                  value={value.count}
                  onChange={(e) => handleValueChange(option, 'count', parseInt(e.target.value))}
                  min="2"
                  disabled={!value.enabled}
                />
              )}
              {['changeSaturation', 'voiceChanger', 'changeHSLLightness', 'changeFrameRate', 'addSticker', 'changeAudioBitrate', 'changeVideoBitrate'].includes(option) && (
                <input
                  type="number"
                  value={value.value}
                  onChange={(e) => handleValueChange(option, 'value', parseFloat(e.target.value))}
                  disabled={!value.enabled}
                  step={option === 'changeHSLLightness' ? '1' : '0.1'}
                />
              )}
              {option === 'changeResolution' && value.enabled && (
                <div>
                  <input
                    type="number"
                    value={value.width}
                    onChange={(e) => handleValueChange(option, 'width', parseInt(e.target.value))}
                    placeholder="Width"
                  />
                  <input
                    type="number"
                    value={value.height}
                    onChange={(e) => handleValueChange(option, 'height', parseInt(e.target.value))}
                    placeholder="Height"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        {ready ? (
          <button className="process-button" onClick={processVideo} disabled={!videoFile}>
            Process Video
          </button>
        ) : (
          <p>Loading FFmpeg...</p>
        )}
        {message && <p>{message}</p>}
        {beforeStats && (
          <div className="stats-section">
            <h3>Before Processing:</h3>
            <pre>{beforeStats}</pre>
          </div>
        )}
        {afterStats && (
          <div className="stats-section">
            <h3>After Processing:</h3>
            <pre>{afterStats}</pre>
          </div>
        )}
      </main>
    </div>
  );
}

function getTooltipText(option) {
  const tooltips = {
    changeMetadata: "Change the video's metadata (title, artist, album, year)",
    changeVideoICC: "Modify the video's ICC (International Color Consortium) profile",
    changeExifData: "Alter the EXIF (Exchangeable Image File Format) data",
    changeMD5Hash: "Change the MD5 hash of the video file",
    changeSaturation: "Adjust the color saturation of the video (0-3, 1 is normal)",
    randomSplits: "Split the video into random segments",
    trimVideoStart: "Trim seconds from the start of the video",
    trimVideoEnd: "Trim seconds from the end of the video",
    voiceChanger: "Change the pitch of the audio (0.5-2, 1 is normal)",
    changeHSLLightness: "Adjust the lightness of the video (-100 to 100, 0 is normal)",
    changeFrameRate: "Change the frame rate of the video (fps)",
    addSticker: "Add a white square sticker to the video (size in pixels)",
    changeAudioBitrate: "Change the audio bitrate (kbps)",
    changeVideoBitrate: "Change the video bitrate (kbps)",
    changeResolution: "Change the resolution of the video (width x height in pixels)"
  };
  return tooltips[option] || "No description available";
}

export default App;
