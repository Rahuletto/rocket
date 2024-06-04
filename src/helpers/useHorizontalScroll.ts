import { useRef, useEffect } from "react"

export default function useHorizontalScroll() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const elem = ref.current
    const onWheel = (ev: WheelEvent) => {
      if (!elem || ev.deltaY === 0) return;

      elem.scrollTo({
        left: elem.scrollLeft + ev.deltaY,
        behavior: 'smooth'
      })
    }

    elem && elem.addEventListener('wheel', onWheel)

    return () => {
      elem && elem.removeEventListener('wheel', onWheel)
    }
  }, [])

  return ref;

}