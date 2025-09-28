import React, { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

// const socket = io('http://localhost:5000') 

const socket = io(
  process.env.REACT_APP_SOCKET_SERVER === 'production'
    ? window.location.origin
    : 'http://localhost:5000'
);


function App() {
  const [status, setStatus] = useState('Connecting...')
  const [roomId, setRoomId] = useState(null)
  const localVideo = useRef()
  const remoteVideo = useRef()
  const peerConnection = useRef(null)

  const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  }

  // ✅ Cleanup helper
  const cleanupConnection = () => {
    if (peerConnection.current) {
      peerConnection.current.ontrack = null
      peerConnection.current.onicecandidate = null
      peerConnection.current.close()
      peerConnection.current = null
    }

    if (localVideo.current && localVideo.current.srcObject) {
      localVideo.current.srcObject.getTracks().forEach((track) => track.stop())
      localVideo.current.srcObject = null
    }

    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null
    }

    setStatus('Call ended. Looking for new partner...')
  }

  useEffect(() => {
    socket.on('connect', () => {
      setStatus('Connected')
      socket.emit('join')
    })

    socket.on('waiting', () => {
      setStatus('Waiting for partner...')
    })

    socket.on('paired', ({ roomId }) => {
      setStatus('Partner found!')
      setRoomId(roomId)
      startCall(roomId)
    })

    socket.on('signal', async ({ signalData }) => {
      if (!peerConnection.current) return
      try {
        if (signalData.type === 'offer') {
          await peerConnection.current.setRemoteDescription(signalData)
          const answer = await peerConnection.current.createAnswer()
          await peerConnection.current.setLocalDescription(answer)
          socket.emit('signal', { roomId, signalData: peerConnection.current.localDescription })
        } else if (signalData.type === 'answer') {
          await peerConnection.current.setRemoteDescription(signalData)
        } else if (signalData.candidate) {
          await peerConnection.current.addIceCandidate(signalData)
        }
      } catch (err) {
        console.error(err)
      }
    })

    // ✅ Handle when partner disconnects
    socket.on('partner-disconnected', () => {
      cleanupConnection()
      socket.emit('join') // auto-search new partner
    })

    return () => {
      cleanupConnection()
      socket.disconnect()
    }
  }, [])

  const startCall = async (roomId) => {
    peerConnection.current = new RTCPeerConnection(configuration)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localVideo.current.srcObject = stream
      stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream))
    } catch (err) {
      console.error('Media error:', err)
      setStatus('Could not access camera/mic')
      return
    }

    peerConnection.current.ontrack = (event) => {
      remoteVideo.current.srcObject = event.streams[0]
    }

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { roomId, signalData: event.candidate })
      }
    }

    const offer = await peerConnection.current.createOffer()
    await peerConnection.current.setLocalDescription(offer)
    socket.emit('signal', { roomId, signalData: offer })
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Random Video Call</h1>
      <p>Status: {status}</p>

      <div>
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          style={{ width: '45%', margin: '10px', background: '#000' }}
        />
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          controls
          style={{ width: '45%', margin: '10px', background: '#000' }}
        />
      </div>

      {/* ✅ Next Partner button */}
      <button
        style={{
          background: 'red',
          color: 'white',
          padding: '10px 20px',
          marginTop: '20px',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
        onClick={() => {
          cleanupConnection()
          socket.emit('join')
        }}
      >
        Next Partner
      </button>
    </div>
  )
}

export default App
