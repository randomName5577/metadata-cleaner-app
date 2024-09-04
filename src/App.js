import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Route, Link, Routes } from "react-router-dom";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import "./App.css";
import EditorBeta from "./EditorBeta";

function App() {
  // ... (previous state and functions remain unchanged)

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
            <Route path="/" element={
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
                  <button onClick={applyRandomValues}>Apply Random Values</button>
                  {Object.entries(options).map(([option, value]) => (
                    <div key={option} className="option">
                      <label>
                        <input
                          type="checkbox"
                          checked={value.enabled}
                          onChange={(e) => handleOptionChange(option, e.target.checked)}
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
                              handleValueChange(option, "title", e.target.value)
                            }
                          />
                          <input
                            type="text"
                            placeholder="Artist"
                            value={value.artist}
                            onChange={(e) =>
                              handleValueChange(option, "artist", e.target.value)
                            }
                          />
                          <input
                            type="text"
                            placeholder="Album"
                            value={value.album}
                            onChange={(e) =>
                              handleValueChange(option, "album", e.target.value)
                            }
                          />
                          <input
                            type="text"
                            placeholder="Year"
                            value={value.year}
                            onChange={(e) =>
                              handleValueChange(option, "year", e.target.value)
                            }
                          />
                        </div>
                      )}
                      {option === "randomSplits" && (
                        <input
                          type="number"
                          value={value.count}
                          onChange={(e) =>
                            handleValueChange(option, "count", parseInt(e.target.value))
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
                            ["trimVideoStart", "trimVideoEnd"].includes(option)
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
                              handleValueChange(option, "left", parseInt(e.target.value))
                            }
                            placeholder="Left"
                          />
                          <input
                            type="number"
                            value={value.right}
                            onChange={(e) =>
                              handleValueChange(option, "right", parseInt(e.target.value))
                            }
                            placeholder="Right"
                          />
                          <input
                            type="number"
                            value={value.top}
                            onChange={(e) =>
                              handleValueChange(option, "top", parseInt(e.target.value))
                            }
                            placeholder="Top"
                          />
                          <input
                            type="number"
                            value={value.bottom}
                            onChange={(e) =>
                              handleValueChange(option, "bottom", parseInt(e.target.value))
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
            } />
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
    removePadding: "Remove pixels from left, right, top, and bottom of the video",
  };
  return tooltips[option] || "No description available";
}

export default App;
