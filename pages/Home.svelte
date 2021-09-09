<script>
	import { db } from "../utils/firebase.js";
	import Header from "../components/Header/Header.svelte";
	import ProgressBar from "../components/ProgressBar/ProgressBar.svelte";
	import {
	  collection,
	  getDocs,
	  doc,
	  onSnapshot,
	  setDoc,
	  query,
	  where
	} from "firebase/firestore";
	import { onMount, onDestroy } from "svelte";
	import Board from "../components/board/Board.svelte";
	let data = [];
	let localServer = [
		{
			active: false
		}
	];
	const q = query(
	  collection(db, "boards/my-room/switches"),
	  where("label", "!=", "")
	);
	const s = query(
		collection(db, "local-server"),
		where("active", "!=", "")
	)
	const unsubscribe = onSnapshot(q, querySnapshot => {
	  data = [];
	  querySnapshot.forEach(doc => {
	    data = [...data, doc.data()];
	  });
	});
	const unsub1 = onSnapshot(s, querySnapshot => {
		localServer = []
	  querySnapshot.forEach(doc => {
	    localServer.push(doc.data());
	  });
	});
	async function getData() {
	  const querySnapshot = await getDocs(
	    collection(db, "boards/my-room/switches")
	  );
	  querySnapshot.forEach(doc => {
	    data.push(doc.data());
	  });
	}
	async function getServerData() {
	  const querySnapshot = await getDocs(
	    collection(db, "local-server")
	  );
	  querySnapshot.forEach(doc => {
	    localServer.push(doc.data());
	  });
	}
	onDestroy(() => {
		unsubscribe()
		unsub1()
	});
	onMount(() => {
		getServerData()
	});
	async function onSwitchClicked(ind) {
	  await setDoc(doc(db, "boards/my-room/switches", data[ind].label), {
	    label: data[ind].label,
	    state: !data[ind].state,
	    type: data[ind].type
	  });
	}
</script>
<Header homeServerStatus={localServer[0].active}></Header>
<section>
	<div class="group">
		{#await getData()}
			<div class="progress-container">
				<ProgressBar />
			</div>
			{:then}
			<Board switches={data} clickHandler={onSwitchClicked}/>
		{/await}
	</div>
</section>

<style>
.progress-container {
	width: 70%;
	margin-top: 2em;
	margin: auto;
}
</style>