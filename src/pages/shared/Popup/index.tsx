import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import styles from "./index.module.css"

type PopupProps = {
    anchor: HTMLElement | null
    onClose: () => void
    className?: string
    offset?: number
    viewportPadding?: number
    children: React.ReactNode
}

type PopupPosition = {
    top: number
    left: number
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min
    return Math.min(Math.max(value, min), max)
}

export function Popup({ anchor, onClose, className, offset = 8, viewportPadding = 8, children }: PopupProps) {
    const popupRef = useRef<HTMLDivElement | null>(null)
    const [position, setPosition] = useState<PopupPosition | null>(null)

    useEffect(() => {
        if (!anchor) return

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node
            if (popupRef.current?.contains(target) || anchor.contains(target)) {
                return
            }

            onClose()
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose()
        }

        document.addEventListener("mousedown", handlePointerDown)
        document.addEventListener("keydown", handleEscape)

        return () => {
            document.removeEventListener("mousedown", handlePointerDown)
            document.removeEventListener("keydown", handleEscape)
        }
    }, [anchor, onClose])

    useLayoutEffect(() => {
        if (!anchor || !popupRef.current) return

        const updatePosition = () => {
            if (!anchor || !popupRef.current) return

            const anchorRect = anchor.getBoundingClientRect()
            const popupRect = popupRef.current.getBoundingClientRect()
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight

            const left = clamp(anchorRect.left, viewportPadding, viewportWidth - popupRect.width - viewportPadding)

            const belowTop = anchorRect.bottom + offset
            const aboveTop = anchorRect.top - popupRect.height - offset
            const fitsBelow = belowTop + popupRect.height <= viewportHeight - viewportPadding
            const fitsAbove = aboveTop >= viewportPadding

            let top = belowTop
            if (!fitsBelow && fitsAbove) {
                top = aboveTop
            }

            top = clamp(top, viewportPadding, viewportHeight - popupRect.height - viewportPadding)

            setPosition({ top, left })
        }

        updatePosition()

        window.addEventListener("resize", updatePosition)
        window.addEventListener("scroll", updatePosition, true)

        return () => {
            window.removeEventListener("resize", updatePosition)
            window.removeEventListener("scroll", updatePosition, true)
        }
    }, [anchor, children, offset, viewportPadding])

    if (!anchor) return null

    return createPortal(
        <div
            ref={popupRef}
            className={`${styles.popup} ${className ?? ""}`}
            style={{
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                visibility: position ? "visible" : "hidden",
            }}
        >
            {children}
        </div>,
        document.body,
    )
}
