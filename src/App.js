import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Route, Link, Routes } from "react-router-dom";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import "./App.css";
import EditorBeta from "./EditorBeta";

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [options, setOptions] = useState({
    changeMetadata: {
      enabled: true,
      title: "",
      artist: "",
      album: "",
      year: "",
    },
    changeVideoICC: { enabled: true },
    changeExifData: { enabled: true },
    changeMD5Hash: { enabled: true },
    changeSaturation: { enabled: true, value: 1 },
    randomSplits: { enabled: true, count: 2 },
    trimVideoStart: { enabled: true, value: 0.1 },
    trimVideoEnd: { enabled: true, value: 0.1 },
    voiceChanger: { enabled: true, pitch: 0.9 },
    changeHSLLightness: { enabled: true, value: 0 },
    changeFrameRate: { enabled: true, value: 30 },
    addSticker: { enabled: true, size: 10 },
    changeAudioBitrate: { enabled: true, value: 128 },
    changeVideoBitrate: { enabled: true, value: 1000 },
    changeResolution: { enabled: true, width: 1080, height: 1920 },
    removePadding: { enabled: true, left: 0, right: 0, top: 0, bottom: 0 },
  });
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [currentStats, setCurrentStats] = useState("");
  const [beforeStats, setBeforeStats] = useState("");
  const [afterStats, setAfterStats] = useState("");
  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(new FFmpeg());

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        await ffmpegRef.current.load();
        setReady(true);
      } catch (error) {
        console.error("Failed to load FFmpeg:", error);
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
        console.error("Failed to get file stats:", error);
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
      console.log("Starting getFileStats function");
      console.log("File object:", file);

      console.log("Writing file to FFmpeg");
      const fileData = await fetchFile(file);
      await ffmpeg.writeFile(file.name, fileData);
      console.log("File written successfully");

      console.log("Executing FFmpeg command");
      const ffmpegCommand = ["-i", file.name];
      let outputData = "";
      ffmpeg.on("log", ({ message }) => {
        outputData += message + "\n";
      });

      await ffmpeg.exec(ffmpegCommand);

      console.log("FFmpeg command executed");
      console.log("Raw output:", outputData);

      const stats = extractBasicInfo(outputData);

      // Calculate additional metadata from the parsed stats
      const videoStream = stats.streams.find((s) => s.codec_type === "video");
      const audioStream = stats.streams.find((s) => s.codec_type === "audio");

      const metadata = {
        filename: file.name,
        filesize: file.size,
        format: stats.format?.format_name || "Unknown",
        duration: stats.format?.duration
          ? parseFloat(stats.format.duration).toFixed(2) + " seconds"
          : "Unknown",
        bitrate: stats.format?.bit_rate
          ? parseInt(stats.format.bit_rate) / 1000 + " kbps"
          : "Unknown",
        videoCodec: videoStream?.codec_name || "Unknown",
        resolution: videoStream
          ? `${videoStream.width}x${videoStream.height}`
          : "Unknown",
        aspectRatio: videoStream?.display_aspect_ratio || "Unknown",
        frameRate: videoStream?.r_frame_rate
          ? parseFloat(videoStream.r_frame_rate).toFixed(2)
          : "Unknown",
        videoBitrate: videoStream?.bit_rate
          ? parseInt(videoStream.bit_rate) / 1000 + " kbps"
          : "Unknown",
        audioCodec: audioStream?.codec_name || "Unknown",
        sampleRate: audioStream?.sample_rate
          ? audioStream.sample_rate + " Hz"
          : "Unknown",
        channels: audioStream?.channels || "Unknown",
        audioBitrate: audioStream?.bit_rate
          ? parseInt(audioStream.bit_rate) / 1000 + " kbps"
          : "Unknown",
        iccProfile: stats.format?.tags?.icc_profile || "Not available",
        exifData: JSON.stringify(stats.format?.tags || {}, null, 2),
      };

      console.log("Extracted metadata:", metadata);
      return metadata;
    } catch (error) {
      console.error("Error in getFileStats:", error);
      throw new Error(`Failed to get file stats: ${error.message}`);
    }
  };

  const extractBasicInfo = (output) => {
    const info = {
      streams: [],
      format: {},
    };

    const lines = output.split("\n");
    let currentStream = null;

    for (const line of lines) {
      if (line.startsWith("Input #0")) {
        const match = line.match(/,\s*(\d+)x(\d+)/);
        if (match) {
          currentStream = {
            codec_type: "video",
            width: parseInt(match[1]),
            height: parseInt(match[2]),
          };
          info.streams.push(currentStream);
        }
      } else if (line.includes("Stream #0:0")) {
        if (line.includes("Video:")) {
          currentStream = { codec_type: "video" };
          const codecMatch = line.match(/Video:\s*(\w+)/);
          if (codecMatch) currentStream.codec_name = codecMatch[1];
          info.streams.push(currentStream);
        } else if (line.includes("Audio:")) {
          currentStream = { codec_type: "audio" };
          const codecMatch = line.match(/Audio:\s*(\w+)/);
          if (codecMatch) currentStream.codec_name = codecMatch[1];
          info.streams.push(currentStream);
        }
      } else if (line.startsWith("  Duration:")) {
        const durationMatch = line.match(
          /Duration:\s*(\d{2}:\d{2}:\d{2}\.\d{2})/
        );
        if (durationMatch) info.format.duration = durationMatch[1];
        const bitrateMatch = line.match(/bitrate:\s*(\d+)\s*kb\/s/);
        if (bitrateMatch)
          info.format.bit_rate = parseInt(bitrateMatch[1]) * 1000;
      }
    }

    return info;
  };

  const processVideo = async () => {
    setMessage("Processing video...");
    try {
      console.log("Video processing started");
      console.log("Selected options:", options);

      const ffmpeg = ffmpegRef.current;
      const inputFileName = videoFile.name;
      const outputFileName = `processed_${inputFileName}`;

      // Write the input file to FFmpeg's virtual file system
      await ffmpeg.writeFile(inputFileName, await fetchFile(videoFile));

      // Prepare FFmpeg command
      let ffmpegCommand = ["-i", inputFileName];

      // Apply video processing options
      if (options.changeSaturation.enabled) {
        ffmpegCommand.push(
          "-vf",
          `eq=saturation=${options.changeSaturation.value}`
        );
      }

      if (options.trimVideoStart.enabled || options.trimVideoEnd.enabled) {
        const startTime = options.trimVideoStart.enabled
          ? options.trimVideoStart.value
          : 0;
        const duration = await getVideoDuration(inputFileName);
        const endTime = options.trimVideoEnd.enabled
          ? duration - options.trimVideoEnd.value
          : duration;
        ffmpegCommand.push(
          "-ss",
          startTime.toString(),
          "-to",
          endTime.toString()
        );
      }

      if (options.voiceChanger.enabled) {
        ffmpegCommand.push(
          "-af",
          `rubberband=pitch=${options.voiceChanger.pitch}`
        );
      }

      if (options.changeHSLLightness.enabled) {
        ffmpegCommand.push(
          "-vf",
          `colorlevels=rimin=${
            options.changeHSLLightness.value / 100 + 1
          }:gimin=${options.changeHSLLightness.value / 100 + 1}:bimin=${
            options.changeHSLLightness.value / 100 + 1
          }`
        );
      }

      if (options.changeFrameRate.enabled) {
        ffmpegCommand.push("-r", options.changeFrameRate.value.toString());
      }

      if (options.changeAudioBitrate.enabled) {
        ffmpegCommand.push("-ab", `${options.changeAudioBitrate.value}k`);
      }

      if (options.changeVideoBitrate.enabled) {
        ffmpegCommand.push("-b:v", `${options.changeVideoBitrate.value}k`);
      }

      if (options.changeResolution.enabled) {
        ffmpegCommand.push(
          "-vf",
          `scale=${options.changeResolution.width}:${options.changeResolution.height}`
        );
      }

      if (options.removePadding.enabled) {
        const { left, right, top, bottom } = options.removePadding;
        ffmpegCommand.push(
          "-vf",
          `crop=in_w-${left + right}:in_h-${top + bottom}:${left}:${top}`
        );
      }

      // Add output file name
      ffmpegCommand.push(outputFileName);

      // Execute FFmpeg command
      await ffmpeg.exec(ffmpegCommand);

      // Read the processed file
      const data = await ffmpeg.readFile(outputFileName);

      // Create a download link for the processed video
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputFileName;
      a.click();

      setMessage("Video processing complete. Download started.");
    } catch (error) {
      console.error("Error processing video:", error);
      setMessage(
        `An error occurred while processing the video: ${error.message}`
      );
    }
  };

  const getVideoDuration = async (filename) => {
    const ffmpeg = ffmpegRef.current;
    const ffprobeCommand = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filename,
    ];
    await ffmpeg.exec(ffprobeCommand);
    const output = await ffmpeg.readFile("out");
    return parseFloat(new TextDecoder().decode(output));
  };

  const applyRandomValues = () => {
    setOptions((prevOptions) => ({
      ...prevOptions,
      changeSaturation: {
        ...prevOptions.changeSaturation,
        value: Math.random() * 0.4 + 0.8, // Random value between 0.8 and 1.2
      },
      trimVideoStart: {
        ...prevOptions.trimVideoStart,
        value: Math.random() * 0.2, // Random value between 0 and 0.2
      },
      trimVideoEnd: {
        ...prevOptions.trimVideoEnd,
        value: Math.random() * 0.2, // Random value between 0 and 0.2
      },
      voiceChanger: {
        ...prevOptions.voiceChanger,
        pitch: Math.random() * 0.2 + 0.9, // Random value between 0.9 and 1.1
      },
      changeHSLLightness: {
        ...prevOptions.changeHSLLightness,
        value: Math.floor(Math.random() * 21) - 10, // Random value between -10 and 10
      },
      changeFrameRate: {
        ...prevOptions.changeFrameRate,
        value: Math.floor(Math.random() * 5) + 28, // Random value between 28 and 32
      },
      changeAudioBitrate: {
        ...prevOptions.changeAudioBitrate,
        value: Math.floor(Math.random() * 33) + 112, // Random value between 112 and 144
      },
      changeVideoBitrate: {
        ...prevOptions.changeVideoBitrate,
        value: Math.floor(Math.random() * 201) + 900, // Random value between 900 and 1100
      },
      removePadding: {
        ...prevOptions.removePadding,
        left: Math.floor(Math.random() * 3),
        right: Math.floor(Math.random() * 3),
        top: Math.floor(Math.random() * 3),
        bottom: Math.floor(Math.random() * 3),
      },
    }));
  };

  const renderTooltip = (text) => (
    <span className="tooltip" title={text}>
      ?
    </span>
  );

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Metadata Cleaner</h1>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/editor-beta">Editor Beta</Link>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/editor-beta" element={<EditorBeta />} />
            <Route
              path="/"
              element={
                <>
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
                    <button onClick={applyRandomValues}>
                      Apply Random Values
                    </button>
                    {Object.entries(options).map(([option, value]) => (
                      <div key={option} className="option">
                        <label>
                          <input
                            type="checkbox"
                            checked={value.enabled}
                            onChange={(e) =>
                              handleOptionChange(option, e.target.checked)
                            }
                          />
                          {option
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase())}
                        </label>
                        {renderTooltip(getTooltipText(option))}
                        {option === "changeMetadata" && value.enabled && (
                          <div className="metadata-inputs">
                            <input
                              type="text"
                              placeholder="Title"
                              value={value.title}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "title",
                                  e.target.value
                                )
                              }
                            />
                            <input
                              type="text"
                              placeholder="Artist"
                              value={value.artist}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "artist",
                                  e.target.value
                                )
                              }
                            />
                            <input
                              type="text"
                              placeholder="Album"
                              value={value.album}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "album",
                                  e.target.value
                                )
                              }
                            />
                            <input
                              type="text"
                              placeholder="Year"
                              value={value.year}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "year",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                        )}
                        {option === "randomSplits" && (
                          <input
                            type="number"
                            value={value.count}
                            onChange={(e) =>
                              handleValueChange(
                                option,
                                "count",
                                parseInt(e.target.value)
                              )
                            }
                            min="2"
                            disabled={!value.enabled}
                          />
                        )}
                        {[
                          "changeSaturation",
                          "voiceChanger",
                          "changeHSLLightness",
                          "changeFrameRate",
                          "addSticker",
                          "changeAudioBitrate",
                          "changeVideoBitrate",
                          "trimVideoStart",
                          "trimVideoEnd",
                        ].includes(option) && (
                          <input
                            type="number"
                            value={value.value}
                            onChange={(e) =>
                              handleValueChange(
                                option,
                                "value",
                                parseFloat(e.target.value)
                              )
                            }
                            disabled={!value.enabled}
                            step={
                              ["trimVideoStart", "trimVideoEnd"].includes(
                                option
                              )
                                ? "0.1"
                                : option === "changeHSLLightness"
                                ? "1"
                                : "0.1"
                            }
                          />
                        )}
                        {option === "changeResolution" && value.enabled && (
                          <div>
                            <input
                              type="number"
                              value={value.width}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "width",
                                  parseInt(e.target.value)
                                )
                              }
                              placeholder="Width"
                            />
                            <input
                              type="number"
                              value={value.height}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "height",
                                  parseInt(e.target.value)
                                )
                              }
                              placeholder="Height"
                            />
                          </div>
                        )}
                        {option === "removePadding" && value.enabled && (
                          <div>
                            <input
                              type="number"
                              value={value.left}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "left",
                                  parseInt(e.target.value)
                                )
                              }
                              placeholder="Left"
                            />
                            <input
                              type="number"
                              value={value.right}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "right",
                                  parseInt(e.target.value)
                                )
                              }
                              placeholder="Right"
                            />
                            <input
                              type="number"
                              value={value.top}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "top",
                                  parseInt(e.target.value)
                                )
                              }
                              placeholder="Top"
                            />
                            <input
                              type="number"
                              value={value.bottom}
                              onChange={(e) =>
                                handleValueChange(
                                  option,
                                  "bottom",
                                  parseInt(e.target.value)
                                )
                              }
                              placeholder="Bottom"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {ready ? (
                    <button
                      className="process-button"
                      onClick={processVideo}
                      disabled={!videoFile}
                    >
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
                </>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function getTooltipText(option) {
  const tooltips = {
    changeMetadata: "Change the video's metadata (title, artist, album, year)",
    changeVideoICC:
      "Modify the video's ICC (International Color Consortium) profile",
    changeExifData: "Alter the EXIF (Exchangeable Image File Format) data",
    changeMD5Hash: "Change the MD5 hash of the video file",
    changeSaturation:
      "Adjust the color saturation of the video (0-3, 1 is normal)",
    randomSplits: "Split the video into random segments",
    trimVideoStart: "Trim seconds from the start of the video",
    trimVideoEnd: "Trim seconds from the end of the video",
    voiceChanger: "Change the pitch of the audio (0.5-2, 1 is normal)",
    changeHSLLightness:
      "Adjust the lightness of the video (-100 to 100, 0 is normal)",
    changeFrameRate: "Change the frame rate of the video (fps)",
    addSticker: "Add a white square sticker to the video (size in pixels)",
    changeAudioBitrate: "Change the audio bitrate (kbps)",
    changeVideoBitrate: "Change the video bitrate (kbps)",
    changeResolution:
      "Change the resolution of the video (width x height in pixels)",
    removePadding:
      "Remove pixels from left, right, top, and bottom of the video",
  };
  return tooltips[option] || "No description available";
}

export default App;
