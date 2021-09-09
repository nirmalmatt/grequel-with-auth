<script>
    import { onMount } from "svelte";
    import { peerConnection } from "../utils/webRtc";

    let remoteStream = null;
    let remoteVideo = null;
    onMount(() => {
      remoteStream = new MediaStream();
      // Pull tracks from remote stream, add to video stream
      peerConnection.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
          remoteStream.addTrack(track);
        });
      };

      remoteVideo.srcObject = remoteStream;
    });
</script>

<section>
    <video bind:this={remoteVideo}>
        <track kind="captions">
    </video>
</section>
