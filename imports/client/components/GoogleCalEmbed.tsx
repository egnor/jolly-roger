import React from 'react';

interface GoogleCalEmbedProps {
  src: string;
  height?: number;
}

const GoogleCalEmbed: React.FC<GoogleCalEmbedProps> = ({ src, height = 180 }) => {
  const encodedSrc = btoa(`${src}@group.calendar.google.com`)
  const embedUrl = `https://calendar.google.com/calendar/u/0/embed?height=${height}&wkst=1&showPrint=0&mode=AGENDA&showTabs=0&showNav=0&showDate=0&title=Events&showTitle=1&showTz=0&showCalendars=0&src=${encodedSrc}`;

  return (
    <iframe
      src={embedUrl}
      style={{ border: 0 }}
      width="100%"
      height={height}
      frameBorder="0"
      scrolling="no"
    />
  );
};

export default GoogleCalEmbed;