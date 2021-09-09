import { writable } from "svelte/store";

let stored = localStorage.theme

if (typeof stored === undefined){
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        stored = "dark"
    }
    else {
        stored = "light"
    }
}

export const theme = writable(stored || "light");
theme.subscribe((value) => localStorage.theme = value)