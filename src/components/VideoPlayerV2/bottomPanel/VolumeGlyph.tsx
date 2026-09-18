import { useId } from 'react'

/** Keep the speaker stable while drawing/removing the mute slash. */
export default function VolumeGlyph({ muted }: { muted: boolean }) {
  const mask = useId()
  return (
    <svg
      viewBox="0 0 88 88"
      aria-hidden="true"
      className={`fc-volume-glyph${muted ? ' is-muted' : ''}`}
    >
      <defs>
        <mask
          id={mask}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="88"
          height="88"
        >
          <rect width="88" height="88" fill="white" />
          <path
            className="fc-mute-slash"
            d="M12 12L76 76"
            stroke="black"
            strokeWidth="16"
          />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <g fill="currentColor" transform="translate(44 44)">
          <path d="M-.44-25.096C-.15-24.736 0-24.296 0-23.846V23.834C0 24.934-.9 25.834-2 25.834c-.45 0-.89-.16-1.25-.44L-20 11.994h-4c-4.42 0-8-3.58-8-8v-8c0-4.42 3.58-8 8-8h4l16.75-13.4c.86-.69 2.12-.55 2.81.31Z" />
          <path d="M13.778-28.896c11.04 5.28 18.22 16.44 18.22 28.89 0 12.46-7.19 23.63-18.25 28.9-1.99.95-4.38.11-5.33-1.89-.95-1.99-.1-4.38 1.89-5.33 8.3-3.95 13.69-12.33 13.69-21.68 0-9.34-5.38-17.71-13.66-21.67-2-.95-2.84-3.34-1.89-5.33.95-2 3.34-2.84 5.33-1.89ZM8-13.866c4.78 2.77 8 7.94 8 13.86s-3.22 11.09-8 13.86Z" />
        </g>
      </g>
      <path
        className="fc-mute-slash"
        d="M12 12L76 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  )
}
