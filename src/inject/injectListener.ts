/**这里面的只能给inject文件夹里的代码用 */
import { createMessager } from '@root/utils/Messager'
import type { TProtocolMap } from './injectMessagerType'

export const {
  offMessage: offMessage_inject,
  onMessage: onMessage_inject,
  onMessageOnce: onMessageOnce_inject,
  sendMessage: sendMessage_inject,
} = createMessager<TProtocolMap>({
  sendType: 'layerpip-inject-response',
  listenType: 'layerpip-inject-request',
})
