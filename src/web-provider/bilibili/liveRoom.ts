export function parseBilibiliLiveRoomId(pathname: string) {
  const roomSegment = pathname.split('/').filter(Boolean).at(-1)
  if (!roomSegment || !/^\d+$/.test(roomSegment)) {
    throw new Error(`无法从直播路径读取房间号：${pathname}`)
  }

  const roomId = Number(roomSegment)
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    throw new Error(`无效的直播房间号：${roomSegment}`)
  }
  return roomId
}
