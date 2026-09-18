export const shouldReturnFocusToPlayer = (
  target: EventTarget | null | undefined,
) => {
  const element = target as Element | null | undefined
  return (
    typeof element?.closest === 'function' && Boolean(element.closest('button'))
  )
}
