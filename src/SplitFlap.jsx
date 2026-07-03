import { useState, useEffect, useRef } from 'react'

function FlapChar({ char, size }) {
  const [current, setCurrent] = useState(char)
  const [previous, setPrevious] = useState(char)
  const [flipping, setFlipping] = useState(false)
  const [flipKey, setFlipKey] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (char === current) return
    setPrevious(current)
    setCurrent(char)
    setFlipping(true)
    setFlipKey(k => k + 1)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlipping(false), 340)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char])

  const dims = size || {}
  const style = {
    ...(dims.h ? { '--fh': `${dims.h}px` } : {}),
    ...(dims.w ? { '--fw': `${dims.w}px` } : {}),
    ...(dims.fs ? { '--ffs': `${dims.fs}px` } : {}),
    ...(dims.color ? { color: dims.color } : {}),
  }

  return (
    <span className="flap" style={style}>
      <span className="flap__half flap__half--top"><span>{current}</span></span>
      <span className="flap__half flap__half--bottom"><span>{current}</span></span>
      {flipping && (
        <span key={flipKey}>
          <span className="flap__leaf flap__leaf--front"><span>{previous}</span></span>
          <span className="flap__leaf flap__leaf--back"><span>{current}</span></span>
        </span>
      )}
    </span>
  )
}

export default function SplitFlap({ text, size, className }) {
  const chars = String(text).split('')
  return (
    <span className={`flap-group ${className || ''}`}>
      {chars.map((c, i) => <FlapChar key={i} char={c} size={size} />)}
    </span>
  )
}
