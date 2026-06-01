import React, { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import styles from "./index.module.css"

export type ModalProps = {
    open?: boolean
    onClickOutside?: () => void

    className?: string

    children: React.ReactNode
}

function ModalInside(props: ModalProps) {
    return <div className={props.className ?? ""}>{props.children}</div>
}

export function Modal(props: ModalProps) {
    const outsideRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!outsideRef.current) {
            return
        }

        function onClick(e: PointerEvent) {
            if (e.currentTarget === e.target) {
                props.onClickOutside?.()
            }
        }

        const abortController = new AbortController()

        outsideRef.current.addEventListener("click", onClick, { signal: abortController.signal })

        return () => abortController.abort()
    }, [outsideRef.current])

    return (
        <>
            {createPortal(
                <div ref={outsideRef} className={styles.outer + " " + (props.open ? styles.open : styles.closed)}>
                    <ModalInside {...props}></ModalInside>
                </div>,
                document.body,
            )}
        </>
    )
}
