import { useRef, useEffect, useCallback, useMemo } from 'react'

// Custom Error Classes
class DebounceCancelError extends Error {
    constructor(message: string = 'Debounced call cancelled') {
        super(message)
        this.name = 'DebounceCancelError'
    }
}

class DebounceUnmountError extends Error {
    constructor(message: string = 'Component unmounted, debounced call cancelled') {
        super(message)
        this.name = 'DebounceUnmountError'
    }
}

// Interface for the returned debounced function and its methods
export interface DebouncedFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>
    cancel(reason?: string | Error): void
    flush(): void
    isPending(): boolean
    settlePendingWith<E extends () => ReturnType<T> | PromiseLike<ReturnType<T>>>(
        executor: E
    ): Promise<Awaited<ReturnType<T>>> // Simplified from Awaited<ReturnType<E>>
}

export function useDebouncedCallback<T extends (...args: any[]) => any>(
    callback: T,
    delay: number,
    options?: { maxWait?: number }
): DebouncedFunction<T> {
    const latestCallbackRef = useRef(callback)
    const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const maxWaitTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastArgsRef = useRef<Parameters<T> | null>(null)
    const pendingPromisesRef = useRef<
        Array<{
            resolve: (value: Awaited<ReturnType<T>>) => void
            reject: (reason?: any) => void
        }>
    >([])
    const isTimerPendingRef = useRef(false)
    const firstInvocationTimeRef = useRef<number | null>(null)
    const unmountedRef = useRef(false)

    useEffect(() => {
        latestCallbackRef.current = callback
    }, [callback])

    const clearAllTimeouts = useCallback(() => {
        if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
        if (maxWaitTimeoutIdRef.current) clearTimeout(maxWaitTimeoutIdRef.current)
        timeoutIdRef.current = null
        maxWaitTimeoutIdRef.current = null
    }, [])

    const resetInternalState = useCallback(() => {
        isTimerPendingRef.current = false
        firstInvocationTimeRef.current = null
        lastArgsRef.current = null
    }, [])

    const rejectPendingPromises = useCallback((reason: Error) => {
        pendingPromisesRef.current.forEach(({ reject }) => reject(reason))
        pendingPromisesRef.current = []
    }, [])

    // Unmount cleanup
    useEffect(() => {
        unmountedRef.current = false
        return () => {
            unmountedRef.current = true
            clearAllTimeouts()
            rejectPendingPromises(new DebounceUnmountError())
            resetInternalState()
        }
    }, [clearAllTimeouts, rejectPendingPromises, resetInternalState])

    const resolveOrRejectCapturedPromises = useCallback(
        (
            capturedPromises: typeof pendingPromisesRef.current,
            action: () => ReturnType<T> | PromiseLike<ReturnType<T>>, // Action is the callback or executor
            ownPromiseControls?: {
                // For settlePendingWith's own promise
                resolve: (value: Awaited<ReturnType<T>>) => void
                reject: (reason?: any) => void
            }
        ) => {
            try {
                const resultOrPromise = action()
                Promise.resolve(resultOrPromise) // Unwraps one layer if it's a promise
                    .then((value: Awaited<ReturnType<T>>) => {
                        if (!unmountedRef.current) {
                            capturedPromises.forEach(({ resolve }) => resolve(value))
                            ownPromiseControls?.resolve(value)
                        } else {
                            const unmountError = new DebounceUnmountError(
                                "Component unmounted while action's result was resolving"
                            )
                            capturedPromises.forEach(({ reject }) => reject(unmountError))
                            ownPromiseControls?.reject(unmountError)
                        }
                    })
                    .catch(error => {
                        if (!unmountedRef.current) {
                            capturedPromises.forEach(({ reject }) => reject(error))
                            ownPromiseControls?.reject(error)
                        } else {
                            const unmountError = new DebounceUnmountError(
                                "Component unmounted while action's result was rejecting"
                            )
                            capturedPromises.forEach(({ reject }) => reject(unmountError))
                            ownPromiseControls?.reject(unmountError)
                        }
                    })
            } catch (error) {
                // Synchronous error from action
                if (!unmountedRef.current) {
                    capturedPromises.forEach(({ reject }) => reject(error))
                    ownPromiseControls?.reject(error)
                } else {
                    const unmountError = new DebounceUnmountError(
                        "Component unmounted during action's synchronous execution"
                    )
                    capturedPromises.forEach(({ reject }) => reject(unmountError))
                    ownPromiseControls?.reject(unmountError)
                }
            }
        },
        [] // unmountedRef is stable and accessed directly
    )

    const executeCallback = useCallback(() => {
        if (unmountedRef.current || !lastArgsRef.current) {
            // Safeguard, should be handled by callers or unmount effect
            if (unmountedRef.current) rejectPendingPromises(new DebounceUnmountError())
            else if (!lastArgsRef.current) {
                rejectPendingPromises(new DebounceCancelError('Executtion attempted without arguments'))
            }
            clearAllTimeouts()
            resetInternalState()
            return
        }

        const currentCallback = latestCallbackRef.current
        const currentArgs = lastArgsRef.current
        const promisesToSettle = [...pendingPromisesRef.current]

        clearAllTimeouts()
        pendingPromisesRef.current = []
        resetInternalState()

        resolveOrRejectCapturedPromises(promisesToSettle, () => currentCallback(...currentArgs))
    }, [clearAllTimeouts, resetInternalState, rejectPendingPromises, resolveOrRejectCapturedPromises])

    const debounced = useCallback(
        (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
            if (unmountedRef.current) {
                return Promise.reject(new DebounceUnmountError())
            }

            lastArgsRef.current = args

            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current)
            }

            const promise = new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
                pendingPromisesRef.current.push({ resolve, reject })
            })

            timeoutIdRef.current = setTimeout(() => {
                if (!unmountedRef.current) {
                    executeCallback()
                }
                // If unmounted, unmount effect should have handled cleanup.
            }, delay)

            if (options?.maxWait && options.maxWait > 0) {
                if (!isTimerPendingRef.current || firstInvocationTimeRef.current === null) {
                    firstInvocationTimeRef.current = Date.now()
                    if (maxWaitTimeoutIdRef.current) {
                        clearTimeout(maxWaitTimeoutIdRef.current)
                    }
                    maxWaitTimeoutIdRef.current = setTimeout(() => {
                        if (isTimerPendingRef.current && !unmountedRef.current) {
                            executeCallback()
                        }
                        // If unmounted, unmount effect should have handled cleanup.
                    }, options.maxWait)
                }
            }
            isTimerPendingRef.current = true
            return promise
        },
        [delay, options?.maxWait, executeCallback, clearAllTimeouts, resetInternalState, rejectPendingPromises]
    )

    const cancel = useCallback(
        (reason?: string | Error) => {
            clearAllTimeouts()
            const cancelError =
                reason instanceof Error
                    ? reason
                    : typeof reason === 'string'
                    ? new DebounceCancelError(reason)
                    : new DebounceCancelError()
            rejectPendingPromises(cancelError)
            resetInternalState()
        },
        [clearAllTimeouts, rejectPendingPromises, resetInternalState]
    )

    const flush = useCallback(() => {
        if (unmountedRef.current) {
            // Unmount effect should handle this, but as a safeguard for direct flush call:
            rejectPendingPromises(new DebounceUnmountError())
            clearAllTimeouts()
            resetInternalState()
            return
        }
        if (isTimerPendingRef.current && lastArgsRef.current) {
            executeCallback()
        }
    }, [executeCallback, rejectPendingPromises, clearAllTimeouts, resetInternalState])

    const isPending = useCallback((): boolean => {
        return isTimerPendingRef.current && !unmountedRef.current
    }, [])

    const settlePendingWith = useCallback(
        <E extends () => ReturnType<T> | PromiseLike<ReturnType<T>>>(executor: E): Promise<Awaited<ReturnType<T>>> => {
            if (unmountedRef.current) {
                const unmountError = new DebounceUnmountError(
                    'Cannot settle pending with executor: component unmounted'
                )
                rejectPendingPromises(unmountError) // Reject any stragglers
                clearAllTimeouts()
                resetInternalState()
                return Promise.reject(unmountError)
            }

            clearAllTimeouts()
            const promisesToSettle = [...pendingPromisesRef.current]
            pendingPromisesRef.current = []
            resetInternalState()

            return new Promise<Awaited<ReturnType<T>>>((resolveOwnPromise, rejectOwnPromise) => {
                resolveOrRejectCapturedPromises(promisesToSettle, executor, {
                    resolve: resolveOwnPromise,
                    reject: rejectOwnPromise,
                })
            })
        },
        [clearAllTimeouts, resetInternalState, rejectPendingPromises, resolveOrRejectCapturedPromises]
    )

    // Effect to handle changes in delay or maxWait
    useEffect(() => {
        // This effect runs after the initial setup and whenever delay/maxWait changes.
        // We don't want to cancel on the very first render if nothing is pending.
        // The check `isTimerPendingRef.current` ensures we only cancel if something was actually scheduled.
        if (isTimerPendingRef.current) {
            cancel(new DebounceCancelError('Debounce configuration changed, pending call cancelled'))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [delay, options?.maxWait]) // `cancel` is memoized and stable

    const debouncedFn = useMemo(() => {
        const fn = debounced as DebouncedFunction<T>
        fn.cancel = cancel
        fn.flush = flush
        fn.isPending = isPending
        fn.settlePendingWith = settlePendingWith
        return fn
    }, [debounced, cancel, flush, isPending, settlePendingWith])

    return debouncedFn
}
