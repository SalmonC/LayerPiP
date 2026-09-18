import classNames from 'classnames'
import { ButtonHTMLAttributes, FC, PropsWithChildren } from 'react'

type Props = {
  isUnActive?: boolean
} & PropsWithChildren &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>

const ActionButton: FC<Props> = (props) => {
  const { isUnActive, className, children, title, ...buttonProps } = props

  return (
    <button
      {...buttonProps}
      type="button"
      data-tooltip={title}
      aria-label={buttonProps['aria-label'] ?? title}
      className={classNames(
        'fc-action-button',
        isUnActive && 'is-unactive',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default ActionButton
