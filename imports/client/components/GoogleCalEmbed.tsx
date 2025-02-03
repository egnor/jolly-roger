import React, { useState, useEffect, useRef } from 'react';

interface GoogleCalEmbedProps extends React.IframeHTMLAttributes<HTMLIFrameElement>{
  src: string;
}

const GoogleCalEmbed: React.FC<GoogleCalEmbedProps> = ({ src, style, ...iframeProps }) => {
  const [embedUrl, setEmbedUrl] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(0);
  const styleWithDefaults = {
    border: 0,
    minHeight: 165,
    ...style
  };

  const createEmbedUrl = (height: number) => {
    // This only works for a single source calendar. Reverse engineering the embed scheme seems to indicate
    // if you want multiple calendars, you encode them as below (base64 encoded with trailing ='s stripped)
    // and join them with the string 'src'.
    const regExp = new RegExp("=+$");
    const encodedSrc = btoa(src).replace(regExp, "");
    return `https://calendar.google.com/calendar/u/0/embed?height=${height}&wkst=1&showPrint=0&mode=AGENDA&showTabs=0&showNav=0&showDate=0&title=Events&showTitle=1&showTz=0&showCalendars=0&src=${encodedSrc}`;
  };

  useEffect(() => {
    const initialHeight = iframeRef.current?.offsetHeight || 0;
    setEmbedUrl(createEmbedUrl(initialHeight));
  }, [src]);


  useEffect(() => {
    if (!iframeRef.current) return;
    const handleLoad = () => {
        if (iframeRef.current) {
          const actualHeight = iframeRef.current.offsetHeight;
          if (actualHeight !== iframeHeight) {
            setIframeHeight(actualHeight);
            setEmbedUrl(createEmbedUrl(actualHeight))
          }
        }
      };

    iframeRef.current.addEventListener('load', handleLoad);

    return () => {
      iframeRef.current?.removeEventListener('load', handleLoad);
    };
  }, [iframeRef, iframeHeight, src]);


  return (
    <iframe
      ref={iframeRef}
      src={embedUrl}
      style={styleWithDefaults}
      {...iframeProps}
    />
  );
};

export default GoogleCalEmbed;