import { Component, type ReactNode, useContext } from 'react'
import { observer } from 'mobx-react'
import { addonRecovery, type AddonKind } from '@root/core/AddonRecovery'
import vpContext from './context'

type Props = {
  kind: AddonKind
  source?: HTMLVideoElement | null
  revision: number
  children: ReactNode
}
class Boundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    addonRecovery.report(this.props.source ?? undefined, this.props.kind, error)
  }
  componentDidUpdate(previous: Props) {
    if (
      this.state.failed &&
      (previous.revision !== this.props.revision ||
        previous.source !== this.props.source)
    )
      this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default observer(function AddonBoundary({
  kind,
  children,
}: {
  kind: AddonKind
  children: ReactNode
}) {
  const { webVideo } = useContext(vpContext)
  return (
    <Boundary
      kind={kind}
      source={webVideo}
      revision={addonRecovery.revision[kind]}
    >
      {children}
    </Boundary>
  )
})
