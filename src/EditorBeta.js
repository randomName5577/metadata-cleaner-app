import React, { useEffect, useRef } from 'react';

function EditorBeta() {
  const rendleyRef = useRef(null);

  useEffect(() => {
    if (rendleyRef.current) {
      const rendleyTemplateElement = rendleyRef.current;

      rendleyTemplateElement.addEventListener("onRenderSuccess", (event) => {
        console.log("--> Render Success", { blobUrl: event.detail });
      });

      rendleyTemplateElement.addEventListener("onRenderError", (event) => {
        console.log("--> Render Error", { message: event.detail });
      });

      rendleyTemplateElement.addEventListener("onReady", async () => {
        const engineInstance = await rendleyTemplateElement.getEngine();
        const engine = engineInstance.getInstance();

        engine.events.on("gallery:added", (gallery) => {
          const file = engine.getLibrary().getMediaById(gallery.mediaDataId);
          console.log("--> Media Added", { gallery, file });
        });

        engine.events.on("gallery:removed", (gallery) => {
          console.log("--> Media Removed", { gallery });
        });
      });
    }
  }, []);

  return (
    <div className="EditorBeta">
      <h1>Editor Beta</h1>
      <rendley-video-editor
        ref={rendleyRef}
        id="rendley"
        licensename={process.env.REACT_APP_RENDLEY_LICENSE_NAME}
        licensekey={process.env.REACT_APP_RENDLEY_LICENSE_KEY}
        pexelsapikey={process.env.REACT_APP_PEXELS_API_KEY}
        giphyapikey={process.env.REACT_APP_GIPHY_API_KEY}
        theme="dark"
      ></rendley-video-editor>
    </div>
  );
}

export default EditorBeta;