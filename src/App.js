import React, { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
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

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        await ffmpegRef.current.load();
        setReady(true);
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setMessage(`Failed to load FFmpeg: ${error.message}`);
      }
    };
    loadFFmpeg();
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    setVideoFile(file);
    if (file) {
      try {
        const stats = await getFileStats(file);
        setCurrentStats(JSON.stringify(stats, null, 2));
      } catch (error) {
        console.error('Failed to get file stats:', error);
        setMessage(`Failed to read file stats: ${error.message}`);
      }
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
    try {
      console.log('Starting getFileStats function');
      console.log('File object:', file);

      console.log('Writing file to FFmpeg');
      const fileData = await fetchFile(file);
      console.log('File data fetched, size:', fileData.byteLength);
      await ffmpeg.writeFile(file.name, fileData);
      console.log('File written successfully');

      console.log('Executing FFmpeg command');
      const ffmpegCommand = ['-i', file.name, '-show_streams', '-show_format', '-of', 'json'];
      console.log('FFmpeg command:', ffmpegCommand);

      let outputData = '';
      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg log:', message);
        outputData += message + '\n';
      });

      await ffmpeg.exec(ffmpegCommand);

      console.log('FFmpeg command executed');
      console.log('Raw output:', outputData);

      // Extract JSON from output
      const jsonStart = outputData.indexOf('{');
      const jsonEnd = outputData.lastIndexOf('}') + 1;
      const jsonString = outputData.slice(jsonStart, jsonEnd);

      console.log('Extracted JSON string:', jsonString);

      let stats;
      try {
        stats = JSON.parse(jsonString);
        console.log('Parsed stats:', stats);
      } catch (error) {
        console.error('Failed to parse JSON:', error);
        // Fallback: extract basic information from the output
        stats = extractBasicInfo(outputData);
        console.log('Fallback stats:', stats);
      }

      // Calculate additional metadata
      const videoStream = stats.streams?.find(s => s.codec_type === 'video');
      const audioStream = stats.streams?.find(s => s.codec_type === 'audio');

      console.log('Video stream:', videoStream);
      console.log('Audio stream:', audioStream);

      const metadata = {
        filename: file.name,
        filesize: file.size,
        format: stats.format?.format_name || 'Unknown',
        duration: stats.format?.duration ? parseFloat(stats.format.duration).toFixed(2) + ' seconds' : 'Unknown',
        bitrate: stats.format?.bit_rate ? parseInt(stats.format.bit_rate) / 1000 + ' kbps' : 'Unknown',
        videoCodec: videoStream?.codec_name || 'Unknown',
        resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : 'Unknown',
        aspectRatio: videoStream?.display_aspect_ratio || 'Unknown',
        frameRate: videoStream?.r_frame_rate ? parseFloat(videoStream.r_frame_rate).toFixed(2) : 'Unknown',
        videoBitrate: videoStream?.bit_rate ? parseInt(videoStream.bit_rate) / 1000 + ' kbps' : 'Unknown',
        audioCodec: audioStream?.codec_name || 'Unknown',
        sampleRate: audioStream?.sample_rate ? audioStream.sample_rate + ' Hz' : 'Unknown',
        channels: audioStream?.channels || 'Unknown',
        audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate) / 1000 + ' kbps' : 'Unknown',
        iccProfile: stats.format?.tags?.icc_profile || 'Not available',
        exifData: JSON.stringify(stats.format?.tags || {}, null, 2),
      };

      console.log('Calculated metadata:', metadata);

      console.log('Calculating MD5 hash');
      await ffmpeg.exec(['-i', file.name, '-f', 'md5', '-']);
      const md5Hash = await ffmpeg.readFile('out.md5');
      metadata.md5Hash = new TextDecoder().decode(md5Hash).trim();
      console.log('MD5 hash calculated successfully:', metadata.md5Hash);

      console.log('getFileStats function completed successfully');
      return metadata;
    } catch (error) {
      console.error('Error in getFileStats:', error);
      let errorMessage = `Failed to get file stats: ${error.message}`;
      if (error.name === 'ErrnoError') {
        errorMessage += `\nError code: ${error.errno}`;
        if (error.errno === 28) {
          errorMessage += '\nPossible cause: No space left on device';
        } else if (error.errno === 2) {
          errorMessage += '\nPossible cause: File not found';
        } else if (error.errno === 1) {
          errorMessage += '\nPossible cause: Operation not permitted';
        }
      }
      throw new Error(errorMessage);
    }
  };

  const extractBasicInfo = (output) => {
    const info = {
      streams: [],
      format: {}
    };

    const lines = output.split('\n');
    let currentStream = null;

    for (const line of lines) {
      if (line.startsWith('Input #0')) {
        const match = line.match(/,\s*(\d+)x(\d+)/);
        if (match) {
          currentStream = { codec_type: 'video', width: parseInt(match[1]), height: parseInt(match[2]) };
          info.streams.push(currentStream);
        }
      } else if (line.includes('Stream #0:0')) {
        if (line.includes('Video:')) {
          currentStream = { codec_type: 'video' };
          const codecMatch = line.match(/Video:\s*(\w+)/);
          if (codecMatch) currentStream.codec_name = codecMatch[1];
          info.streams.push(currentStream);
        } else if (line.includes('Audio:')) {
          currentStream = { codec_type: 'audio' };
          const codecMatch = line.match(/Audio:\s*(\w+)/);
          if (codecMatch) currentStream.codec_name = codecMatch[1];
          info.streams.push(currentStream);
        }
      } else if (line.startsWith('  Duration:')) {
        const durationMatch = line.match(/Duration:\s*(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (durationMatch) info.format.duration = durationMatch[1];
        const bitrateMatch = line.match(/bitrate:\s*(\d+)\s*kb\/s/);
        if (bitrateMatch) info.format.bit_rate = parseInt(bitrateMatch[1]) * 1000;
      }
    }

    return info;
  };

  const processVideo = async () => {
    setMessage('Processing video...');
    try {
      // Placeholder for video processing logic
      console.log('Video processing started');
      console.log('Selected options:', options);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setMessage('Video processing complete. (This is a placeholder message)');
    } catch (error) {
      console.error('Error processing video:', error);
      setMessage(`An error occurred while processing the video: ${error.message}`);
    }
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
