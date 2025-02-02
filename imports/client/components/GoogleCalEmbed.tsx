import React from 'react';

interface GoogleCalEmbedProps {
  src: string;
  height?: number;
}

const GoogleCalEmbed: React.FC<GoogleCalEmbedProps> = ({ src, height = 180 }) => {
  /*
  * For future note, it appears the google calendar embed code uses the Base64 encoded full calendar ID, with the trailing
  * equal signs removed. To display more than one calendar, the encoded Base64 strings are joined with the characters 'src',
  * which is not yet supported here.
  * 
  * Valid  calendar IDs appear to be either Google IDs (email addresses) or strings of the form
  * 0123...cdef@group.calendar.google.com
  */
  var regExp = new RegExp("=+$");
  const encodedSrc = btoa(src).replace(regExp, "")
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