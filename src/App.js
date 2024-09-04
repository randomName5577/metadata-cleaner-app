import React, { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import './App.css';

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [options, setOptions] = useState({
    changeMetadata: { enabled: false, title: '', artist: '', album: '', year: '' },
    changeVideoICC: { enabled: false },
    changeExifData: { enabled: false },
    changeMD5Hash: { enabled: false },
    changeSaturation: { enabled: false, value: 1 },
    randomSplits: { enabled: false, count: 2 },
    trimVideoStart: { enabled: false, value: 0 },
    trimVideoEnd: { enabled: false, value: 0 },
    voiceChanger: { enabled: false, pitch: 0.9 },
    changeHSLLightness: { enabled: false, value: -1 },
    changeFrameRate: { enabled: false, value: 30 },
    addSticker: { enabled: false, size: 10 },
    changeAudioBitrate: { enabled: false, value: 128 },
    changeVideoBitrate: { enabled: false, value: 1000 },
    changeResolution: { enabled: false, width: 1280, height: 720 },
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
    await ffmpeg.load();
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

  const getFileStats = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const stats = {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: new Date(file.lastModified).toISOString(),
          byteLength: arrayBuffer.byteLength,
        };
        resolve(stats);
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const getVideoStats = async (ffmpeg, fileName) => {
    const result = await ffmpeg.exec(['-i', fileName, '-show_streams', '-show_format', '-of', 'json']);
    return ffmpeg.readFile('out.json', { encoding: 'utf8' });
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
      const duration = parseFloat((await ffmpeg.exec(['-i', inputFileName, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'])).split('\n')[0]);
      
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
      const duration = parseFloat((await ffmpeg.exec(['-i', inputFileName, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'])).split('\n')[0]);
      const splitPoints = Array.from({length: options.randomSplits.count - 1}, () => Math.random() * duration).sort((a, b) => a - b);
      
      let splitCommand = `-i ${inputFileName} ${inputOptions} ${filterComplex}`;
      splitPoints.forEach((point, index) => {
        splitCommand += ` -t ${point} -c copy split_${index}.mp4`;
      });
      splitCommand += ` -t ${duration} -c copy split_${options.randomSplits.count - 1}.mp4`;
      
      await ffmpeg.exec(splitCommand.split(' '));
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

export default App;
