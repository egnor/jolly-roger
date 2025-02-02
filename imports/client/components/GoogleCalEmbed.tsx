import React from 'react';

interface GoogleCalEmbedProps {
  src: string;
}

const GoogleCalEmbed: React.FC<GoogleCalEmbedProps> = ({ src }) => {
  const embedUrl = `https://calendar.google.com/calendar/u/0/embed?height=200&wkst=1&showPrint=0&mode=AGENDA&showTabs=0&showNav=0&showDate=0&title=Events&showTitle=1&showTz=0&showCalendars=0&src=${src}`;

  return (
    <iframe
      src={embedUrl}
      style={{ border: 0 }}
      width="100%"
      height="200"
      frameBorder="0"
      scrolling="no"
    />
  );
};

export default GoogleCalEmbed;