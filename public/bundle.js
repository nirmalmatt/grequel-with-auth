var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function is_promise(value) {
        return value && typeof value === 'object' && typeof value.then === 'function';
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function get_root_for_style(node) {
        if (!node)
            return document;
        const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
        if (root && root.host) {
            return root;
        }
        return node.ownerDocument;
    }
    function append_empty_stylesheet(node) {
        const style_element = element('style');
        append_stylesheet(get_root_for_style(node), style_element);
        return style_element;
    }
    function append_stylesheet(node, style) {
        append(node.head || node, style);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = get_root_for_style(node);
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = append_empty_stylesheet(node).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    function handle_promise(promise, info) {
        const token = info.token = {};
        function update(type, index, key, value) {
            if (info.token !== token)
                return;
            info.resolved = value;
            let child_ctx = info.ctx;
            if (key !== undefined) {
                child_ctx = child_ctx.slice();
                child_ctx[key] = value;
            }
            const block = type && (info.current = type)(child_ctx);
            let needs_flush = false;
            if (info.block) {
                if (info.blocks) {
                    info.blocks.forEach((block, i) => {
                        if (i !== index && block) {
                            group_outros();
                            transition_out(block, 1, 1, () => {
                                if (info.blocks[i] === block) {
                                    info.blocks[i] = null;
                                }
                            });
                            check_outros();
                        }
                    });
                }
                else {
                    info.block.d(1);
                }
                block.c();
                transition_in(block, 1);
                block.m(info.mount(), info.anchor);
                needs_flush = true;
            }
            info.block = block;
            if (info.blocks)
                info.blocks[index] = block;
            if (needs_flush) {
                flush();
            }
        }
        if (is_promise(promise)) {
            const current_component = get_current_component();
            promise.then(value => {
                set_current_component(current_component);
                update(info.then, 1, info.value, value);
                set_current_component(null);
            }, error => {
                set_current_component(current_component);
                update(info.catch, 2, info.error, error);
                set_current_component(null);
                if (!info.hasCatch) {
                    throw error;
                }
            });
            // if we previously had a then/catch block, destroy it
            if (info.current !== info.pending) {
                update(info.pending, 0);
                return true;
            }
        }
        else {
            if (info.current !== info.then) {
                update(info.then, 1, info.value, promise);
                return true;
            }
            info.resolved = promise;
        }
    }
    function update_await_block_branch(info, ctx, dirty) {
        const child_ctx = ctx.slice();
        const { resolved } = info;
        if (info.current === info.then) {
            child_ctx[info.value] = resolved;
        }
        if (info.current === info.catch) {
            child_ctx[info.error] = resolved;
        }
        info.block.p(child_ctx, dirty);
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.42.4' }, detail), true));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    let stored = localStorage.theme;

    if (typeof stored === undefined){
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            stored = "dark";
        }
        else {
            stored = "light";
        }
    }

    const theme = writable(stored || "light");
    theme.subscribe((value) => localStorage.theme = value);

    /* pages/Controls.svelte generated by Svelte v3.42.4 */
    const file = "pages/Controls.svelte";

    function create_fragment(ctx) {
    	let ul;
    	let li;
    	let button;
    	let t0;
    	let t1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			ul = element("ul");
    			li = element("li");
    			button = element("button");
    			t0 = text("Toggle Theme: ");
    			t1 = text(/*$theme*/ ctx[0]);
    			attr_dev(button, "class", "button svelte-1eh4s0l");
    			add_location(button, file, 12, 4, 245);
    			add_location(li, file, 11, 2, 235);
    			add_location(ul, file, 10, 0, 227);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, ul, anchor);
    			append_dev(ul, li);
    			append_dev(li, button);
    			append_dev(button, t0);
    			append_dev(button, t1);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*$theme*/ 1) set_data_dev(t1, /*$theme*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(ul);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $theme;
    	validate_store(theme, 'theme');
    	component_subscribe($$self, theme, $$value => $$invalidate(0, $theme = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Controls', slots, []);

    	function toggleTheme() {
    		if ($theme === "light") {
    			theme.update(them => "dark");
    		} else {
    			theme.update(them => "light");
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Controls> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => toggleTheme();
    	$$self.$capture_state = () => ({ theme, toggleTheme, $theme });
    	return [$theme, toggleTheme, click_handler];
    }

    class Controls extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Controls",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    }

    function __values(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    }

    function __read(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spreadArray(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
            if (ar || !(i in from)) {
                if (!ar) ar = Array.prototype.slice.call(from, 0, i);
                ar[i] = from[i];
            }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var Deferred = /** @class */ (function () {
        function Deferred() {
            var _this = this;
            this.reject = function () { };
            this.resolve = function () { };
            this.promise = new Promise(function (resolve, reject) {
                _this.resolve = resolve;
                _this.reject = reject;
            });
        }
        /**
         * Our API internals are not promiseified and cannot because our callback APIs have subtle expectations around
         * invoking promises inline, which Promises are forbidden to do. This method accepts an optional node-style callback
         * and returns a node-style callback which will resolve or reject the Deferred's promise.
         */
        Deferred.prototype.wrapCallback = function (callback) {
            var _this = this;
            return function (error, value) {
                if (error) {
                    _this.reject(error);
                }
                else {
                    _this.resolve(value);
                }
                if (typeof callback === 'function') {
                    // Attaching noop handler just in case developer wasn't expecting
                    // promises
                    _this.promise.catch(function () { });
                    // Some of our callbacks don't expect a value and our own tests
                    // assert that the parameter length is 1
                    if (callback.length === 1) {
                        callback(error);
                    }
                    else {
                        callback(error, value);
                    }
                }
            };
        };
        return Deferred;
    }());

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Returns navigator.userAgent string or '' if it's not defined.
     * @return user agent string
     */
    function getUA() {
        if (typeof navigator !== 'undefined' &&
            typeof navigator['userAgent'] === 'string') {
            return navigator['userAgent'];
        }
        else {
            return '';
        }
    }
    /**
     * Detect Cordova / PhoneGap / Ionic frameworks on a mobile device.
     *
     * Deliberately does not rely on checking `file://` URLs (as this fails PhoneGap
     * in the Ripple emulator) nor Cordova `onDeviceReady`, which would normally
     * wait for a callback.
     */
    function isMobileCordova() {
        return (typeof window !== 'undefined' &&
            // @ts-ignore Setting up an broadly applicable index signature for Window
            // just to deal with this case would probably be a bad idea.
            !!(window['cordova'] || window['phonegap'] || window['PhoneGap']) &&
            /ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(getUA()));
    }
    function isBrowserExtension() {
        var runtime = typeof chrome === 'object'
            ? chrome.runtime
            : typeof browser === 'object'
                ? browser.runtime
                : undefined;
        return typeof runtime === 'object' && runtime.id !== undefined;
    }
    /**
     * Detect React Native.
     *
     * @return true if ReactNative environment is detected.
     */
    function isReactNative() {
        return (typeof navigator === 'object' && navigator['product'] === 'ReactNative');
    }
    /** Detects Electron apps. */
    function isElectron() {
        return getUA().indexOf('Electron/') >= 0;
    }
    /** Detects Internet Explorer. */
    function isIE() {
        var ua = getUA();
        return ua.indexOf('MSIE ') >= 0 || ua.indexOf('Trident/') >= 0;
    }
    /** Detects Universal Windows Platform apps. */
    function isUWP() {
        return getUA().indexOf('MSAppHost/') >= 0;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var ERROR_NAME = 'FirebaseError';
    // Based on code from:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Custom_Error_Types
    var FirebaseError = /** @class */ (function (_super) {
        __extends(FirebaseError, _super);
        function FirebaseError(code, message, customData) {
            var _this = _super.call(this, message) || this;
            _this.code = code;
            _this.customData = customData;
            _this.name = ERROR_NAME;
            // Fix For ES5
            // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
            Object.setPrototypeOf(_this, FirebaseError.prototype);
            // Maintains proper stack trace for where our error was thrown.
            // Only available on V8.
            if (Error.captureStackTrace) {
                Error.captureStackTrace(_this, ErrorFactory.prototype.create);
            }
            return _this;
        }
        return FirebaseError;
    }(Error));
    var ErrorFactory = /** @class */ (function () {
        function ErrorFactory(service, serviceName, errors) {
            this.service = service;
            this.serviceName = serviceName;
            this.errors = errors;
        }
        ErrorFactory.prototype.create = function (code) {
            var data = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                data[_i - 1] = arguments[_i];
            }
            var customData = data[0] || {};
            var fullCode = this.service + "/" + code;
            var template = this.errors[code];
            var message = template ? replaceTemplate(template, customData) : 'Error';
            // Service Name: Error message (service/code).
            var fullMessage = this.serviceName + ": " + message + " (" + fullCode + ").";
            var error = new FirebaseError(fullCode, fullMessage, customData);
            return error;
        };
        return ErrorFactory;
    }());
    function replaceTemplate(template, data) {
        return template.replace(PATTERN, function (_, key) {
            var value = data[key];
            return value != null ? String(value) : "<" + key + "?>";
        });
    }
    var PATTERN = /\{\$([^}]+)}/g;
    /**
     * Deep equal two objects. Support Arrays and Objects.
     */
    function deepEqual(a, b) {
        if (a === b) {
            return true;
        }
        var aKeys = Object.keys(a);
        var bKeys = Object.keys(b);
        for (var _i = 0, aKeys_1 = aKeys; _i < aKeys_1.length; _i++) {
            var k = aKeys_1[_i];
            if (!bKeys.includes(k)) {
                return false;
            }
            var aProp = a[k];
            var bProp = b[k];
            if (isObject(aProp) && isObject(bProp)) {
                if (!deepEqual(aProp, bProp)) {
                    return false;
                }
            }
            else if (aProp !== bProp) {
                return false;
            }
        }
        for (var _a = 0, bKeys_1 = bKeys; _a < bKeys_1.length; _a++) {
            var k = bKeys_1[_a];
            if (!aKeys.includes(k)) {
                return false;
            }
        }
        return true;
    }
    function isObject(thing) {
        return thing !== null && typeof thing === 'object';
    }

    /**
     * @license
     * Copyright 2021 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    function getModularInstance(service) {
        if (service && service._delegate) {
            return service._delegate;
        }
        else {
            return service;
        }
    }

    /**
     * Component for service name T, e.g. `auth`, `auth-internal`
     */
    var Component = /** @class */ (function () {
        /**
         *
         * @param name The public service name, e.g. app, auth, firestore, database
         * @param instanceFactory Service factory responsible for creating the public interface
         * @param type whether the service provided by the component is public or private
         */
        function Component(name, instanceFactory, type) {
            this.name = name;
            this.instanceFactory = instanceFactory;
            this.type = type;
            this.multipleInstances = false;
            /**
             * Properties to be added to the service namespace
             */
            this.serviceProps = {};
            this.instantiationMode = "LAZY" /* LAZY */;
            this.onInstanceCreated = null;
        }
        Component.prototype.setInstantiationMode = function (mode) {
            this.instantiationMode = mode;
            return this;
        };
        Component.prototype.setMultipleInstances = function (multipleInstances) {
            this.multipleInstances = multipleInstances;
            return this;
        };
        Component.prototype.setServiceProps = function (props) {
            this.serviceProps = props;
            return this;
        };
        Component.prototype.setInstanceCreatedCallback = function (callback) {
            this.onInstanceCreated = callback;
            return this;
        };
        return Component;
    }());

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var DEFAULT_ENTRY_NAME = '[DEFAULT]';

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Provider for instance for service name T, e.g. 'auth', 'auth-internal'
     * NameServiceMapping[T] is an alias for the type of the instance
     */
    var Provider = /** @class */ (function () {
        function Provider(name, container) {
            this.name = name;
            this.container = container;
            this.component = null;
            this.instances = new Map();
            this.instancesDeferred = new Map();
            this.instancesOptions = new Map();
            this.onInitCallbacks = new Map();
        }
        /**
         * @param identifier A provider can provide mulitple instances of a service
         * if this.component.multipleInstances is true.
         */
        Provider.prototype.get = function (identifier) {
            // if multipleInstances is not supported, use the default name
            var normalizedIdentifier = this.normalizeInstanceIdentifier(identifier);
            if (!this.instancesDeferred.has(normalizedIdentifier)) {
                var deferred = new Deferred();
                this.instancesDeferred.set(normalizedIdentifier, deferred);
                if (this.isInitialized(normalizedIdentifier) ||
                    this.shouldAutoInitialize()) {
                    // initialize the service if it can be auto-initialized
                    try {
                        var instance = this.getOrInitializeService({
                            instanceIdentifier: normalizedIdentifier
                        });
                        if (instance) {
                            deferred.resolve(instance);
                        }
                    }
                    catch (e) {
                        // when the instance factory throws an exception during get(), it should not cause
                        // a fatal error. We just return the unresolved promise in this case.
                    }
                }
            }
            return this.instancesDeferred.get(normalizedIdentifier).promise;
        };
        Provider.prototype.getImmediate = function (options) {
            var _a;
            // if multipleInstances is not supported, use the default name
            var normalizedIdentifier = this.normalizeInstanceIdentifier(options === null || options === void 0 ? void 0 : options.identifier);
            var optional = (_a = options === null || options === void 0 ? void 0 : options.optional) !== null && _a !== void 0 ? _a : false;
            if (this.isInitialized(normalizedIdentifier) ||
                this.shouldAutoInitialize()) {
                try {
                    return this.getOrInitializeService({
                        instanceIdentifier: normalizedIdentifier
                    });
                }
                catch (e) {
                    if (optional) {
                        return null;
                    }
                    else {
                        throw e;
                    }
                }
            }
            else {
                // In case a component is not initialized and should/can not be auto-initialized at the moment, return null if the optional flag is set, or throw
                if (optional) {
                    return null;
                }
                else {
                    throw Error("Service " + this.name + " is not available");
                }
            }
        };
        Provider.prototype.getComponent = function () {
            return this.component;
        };
        Provider.prototype.setComponent = function (component) {
            var e_1, _a;
            if (component.name !== this.name) {
                throw Error("Mismatching Component " + component.name + " for Provider " + this.name + ".");
            }
            if (this.component) {
                throw Error("Component for " + this.name + " has already been provided");
            }
            this.component = component;
            // return early without attempting to initialize the component if the component requires explicit initialization (calling `Provider.initialize()`)
            if (!this.shouldAutoInitialize()) {
                return;
            }
            // if the service is eager, initialize the default instance
            if (isComponentEager(component)) {
                try {
                    this.getOrInitializeService({ instanceIdentifier: DEFAULT_ENTRY_NAME });
                }
                catch (e) {
                    // when the instance factory for an eager Component throws an exception during the eager
                    // initialization, it should not cause a fatal error.
                    // TODO: Investigate if we need to make it configurable, because some component may want to cause
                    // a fatal error in this case?
                }
            }
            try {
                // Create service instances for the pending promises and resolve them
                // NOTE: if this.multipleInstances is false, only the default instance will be created
                // and all promises with resolve with it regardless of the identifier.
                for (var _b = __values(this.instancesDeferred.entries()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = __read(_c.value, 2), instanceIdentifier = _d[0], instanceDeferred = _d[1];
                    var normalizedIdentifier = this.normalizeInstanceIdentifier(instanceIdentifier);
                    try {
                        // `getOrInitializeService()` should always return a valid instance since a component is guaranteed. use ! to make typescript happy.
                        var instance = this.getOrInitializeService({
                            instanceIdentifier: normalizedIdentifier
                        });
                        instanceDeferred.resolve(instance);
                    }
                    catch (e) {
                        // when the instance factory throws an exception, it should not cause
                        // a fatal error. We just leave the promise unresolved.
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        };
        Provider.prototype.clearInstance = function (identifier) {
            if (identifier === void 0) { identifier = DEFAULT_ENTRY_NAME; }
            this.instancesDeferred.delete(identifier);
            this.instancesOptions.delete(identifier);
            this.instances.delete(identifier);
        };
        // app.delete() will call this method on every provider to delete the services
        // TODO: should we mark the provider as deleted?
        Provider.prototype.delete = function () {
            return __awaiter(this, void 0, void 0, function () {
                var services;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            services = Array.from(this.instances.values());
                            return [4 /*yield*/, Promise.all(__spreadArray(__spreadArray([], __read(services
                                    .filter(function (service) { return 'INTERNAL' in service; }) // legacy services
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    .map(function (service) { return service.INTERNAL.delete(); }))), __read(services
                                    .filter(function (service) { return '_delete' in service; }) // modularized services
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    .map(function (service) { return service._delete(); }))))];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        };
        Provider.prototype.isComponentSet = function () {
            return this.component != null;
        };
        Provider.prototype.isInitialized = function (identifier) {
            if (identifier === void 0) { identifier = DEFAULT_ENTRY_NAME; }
            return this.instances.has(identifier);
        };
        Provider.prototype.getOptions = function (identifier) {
            if (identifier === void 0) { identifier = DEFAULT_ENTRY_NAME; }
            return this.instancesOptions.get(identifier) || {};
        };
        Provider.prototype.initialize = function (opts) {
            var e_2, _a;
            if (opts === void 0) { opts = {}; }
            var _b = opts.options, options = _b === void 0 ? {} : _b;
            var normalizedIdentifier = this.normalizeInstanceIdentifier(opts.instanceIdentifier);
            if (this.isInitialized(normalizedIdentifier)) {
                throw Error(this.name + "(" + normalizedIdentifier + ") has already been initialized");
            }
            if (!this.isComponentSet()) {
                throw Error("Component " + this.name + " has not been registered yet");
            }
            var instance = this.getOrInitializeService({
                instanceIdentifier: normalizedIdentifier,
                options: options
            });
            try {
                // resolve any pending promise waiting for the service instance
                for (var _c = __values(this.instancesDeferred.entries()), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var _e = __read(_d.value, 2), instanceIdentifier = _e[0], instanceDeferred = _e[1];
                    var normalizedDeferredIdentifier = this.normalizeInstanceIdentifier(instanceIdentifier);
                    if (normalizedIdentifier === normalizedDeferredIdentifier) {
                        instanceDeferred.resolve(instance);
                    }
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                }
                finally { if (e_2) throw e_2.error; }
            }
            return instance;
        };
        /**
         *
         * @param callback - a function that will be invoked  after the provider has been initialized by calling provider.initialize().
         * The function is invoked SYNCHRONOUSLY, so it should not execute any longrunning tasks in order to not block the program.
         *
         * @param identifier An optional instance identifier
         * @returns a function to unregister the callback
         */
        Provider.prototype.onInit = function (callback, identifier) {
            var _a;
            var normalizedIdentifier = this.normalizeInstanceIdentifier(identifier);
            var existingCallbacks = (_a = this.onInitCallbacks.get(normalizedIdentifier)) !== null && _a !== void 0 ? _a : new Set();
            existingCallbacks.add(callback);
            this.onInitCallbacks.set(normalizedIdentifier, existingCallbacks);
            var existingInstance = this.instances.get(normalizedIdentifier);
            if (existingInstance) {
                callback(existingInstance, normalizedIdentifier);
            }
            return function () {
                existingCallbacks.delete(callback);
            };
        };
        /**
         * Invoke onInit callbacks synchronously
         * @param instance the service instance`
         */
        Provider.prototype.invokeOnInitCallbacks = function (instance, identifier) {
            var e_3, _a;
            var callbacks = this.onInitCallbacks.get(identifier);
            if (!callbacks) {
                return;
            }
            try {
                for (var callbacks_1 = __values(callbacks), callbacks_1_1 = callbacks_1.next(); !callbacks_1_1.done; callbacks_1_1 = callbacks_1.next()) {
                    var callback = callbacks_1_1.value;
                    try {
                        callback(instance, identifier);
                    }
                    catch (_b) {
                        // ignore errors in the onInit callback
                    }
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (callbacks_1_1 && !callbacks_1_1.done && (_a = callbacks_1.return)) _a.call(callbacks_1);
                }
                finally { if (e_3) throw e_3.error; }
            }
        };
        Provider.prototype.getOrInitializeService = function (_a) {
            var instanceIdentifier = _a.instanceIdentifier, _b = _a.options, options = _b === void 0 ? {} : _b;
            var instance = this.instances.get(instanceIdentifier);
            if (!instance && this.component) {
                instance = this.component.instanceFactory(this.container, {
                    instanceIdentifier: normalizeIdentifierForFactory(instanceIdentifier),
                    options: options
                });
                this.instances.set(instanceIdentifier, instance);
                this.instancesOptions.set(instanceIdentifier, options);
                /**
                 * Invoke onInit listeners.
                 * Note this.component.onInstanceCreated is different, which is used by the component creator,
                 * while onInit listeners are registered by consumers of the provider.
                 */
                this.invokeOnInitCallbacks(instance, instanceIdentifier);
                /**
                 * Order is important
                 * onInstanceCreated() should be called after this.instances.set(instanceIdentifier, instance); which
                 * makes `isInitialized()` return true.
                 */
                if (this.component.onInstanceCreated) {
                    try {
                        this.component.onInstanceCreated(this.container, instanceIdentifier, instance);
                    }
                    catch (_c) {
                        // ignore errors in the onInstanceCreatedCallback
                    }
                }
            }
            return instance || null;
        };
        Provider.prototype.normalizeInstanceIdentifier = function (identifier) {
            if (identifier === void 0) { identifier = DEFAULT_ENTRY_NAME; }
            if (this.component) {
                return this.component.multipleInstances ? identifier : DEFAULT_ENTRY_NAME;
            }
            else {
                return identifier; // assume multiple instances are supported before the component is provided.
            }
        };
        Provider.prototype.shouldAutoInitialize = function () {
            return (!!this.component &&
                this.component.instantiationMode !== "EXPLICIT" /* EXPLICIT */);
        };
        return Provider;
    }());
    // undefined should be passed to the service factory for the default instance
    function normalizeIdentifierForFactory(identifier) {
        return identifier === DEFAULT_ENTRY_NAME ? undefined : identifier;
    }
    function isComponentEager(component) {
        return component.instantiationMode === "EAGER" /* EAGER */;
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * ComponentContainer that provides Providers for service name T, e.g. `auth`, `auth-internal`
     */
    var ComponentContainer = /** @class */ (function () {
        function ComponentContainer(name) {
            this.name = name;
            this.providers = new Map();
        }
        /**
         *
         * @param component Component being added
         * @param overwrite When a component with the same name has already been registered,
         * if overwrite is true: overwrite the existing component with the new component and create a new
         * provider with the new component. It can be useful in tests where you want to use different mocks
         * for different tests.
         * if overwrite is false: throw an exception
         */
        ComponentContainer.prototype.addComponent = function (component) {
            var provider = this.getProvider(component.name);
            if (provider.isComponentSet()) {
                throw new Error("Component " + component.name + " has already been registered with " + this.name);
            }
            provider.setComponent(component);
        };
        ComponentContainer.prototype.addOrOverwriteComponent = function (component) {
            var provider = this.getProvider(component.name);
            if (provider.isComponentSet()) {
                // delete the existing provider from the container, so we can register the new component
                this.providers.delete(component.name);
            }
            this.addComponent(component);
        };
        /**
         * getProvider provides a type safe interface where it can only be called with a field name
         * present in NameServiceMapping interface.
         *
         * Firebase SDKs providing services should extend NameServiceMapping interface to register
         * themselves.
         */
        ComponentContainer.prototype.getProvider = function (name) {
            if (this.providers.has(name)) {
                return this.providers.get(name);
            }
            // create a Provider for a service that hasn't registered with Firebase
            var provider = new Provider(name, this);
            this.providers.set(name, provider);
            return provider;
        };
        ComponentContainer.prototype.getProviders = function () {
            return Array.from(this.providers.values());
        };
        return ComponentContainer;
    }());

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __spreadArrays() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    var _a;
    /**
     * The JS SDK supports 5 log levels and also allows a user the ability to
     * silence the logs altogether.
     *
     * The order is a follows:
     * DEBUG < VERBOSE < INFO < WARN < ERROR
     *
     * All of the log types above the current log level will be captured (i.e. if
     * you set the log level to `INFO`, errors will still be logged, but `DEBUG` and
     * `VERBOSE` logs will not)
     */
    var LogLevel;
    (function (LogLevel) {
        LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
        LogLevel[LogLevel["VERBOSE"] = 1] = "VERBOSE";
        LogLevel[LogLevel["INFO"] = 2] = "INFO";
        LogLevel[LogLevel["WARN"] = 3] = "WARN";
        LogLevel[LogLevel["ERROR"] = 4] = "ERROR";
        LogLevel[LogLevel["SILENT"] = 5] = "SILENT";
    })(LogLevel || (LogLevel = {}));
    var levelStringToEnum = {
        'debug': LogLevel.DEBUG,
        'verbose': LogLevel.VERBOSE,
        'info': LogLevel.INFO,
        'warn': LogLevel.WARN,
        'error': LogLevel.ERROR,
        'silent': LogLevel.SILENT
    };
    /**
     * The default log level
     */
    var defaultLogLevel = LogLevel.INFO;
    /**
     * By default, `console.debug` is not displayed in the developer console (in
     * chrome). To avoid forcing users to have to opt-in to these logs twice
     * (i.e. once for firebase, and once in the console), we are sending `DEBUG`
     * logs to the `console.log` function.
     */
    var ConsoleMethod = (_a = {},
        _a[LogLevel.DEBUG] = 'log',
        _a[LogLevel.VERBOSE] = 'log',
        _a[LogLevel.INFO] = 'info',
        _a[LogLevel.WARN] = 'warn',
        _a[LogLevel.ERROR] = 'error',
        _a);
    /**
     * The default log handler will forward DEBUG, VERBOSE, INFO, WARN, and ERROR
     * messages on to their corresponding console counterparts (if the log method
     * is supported by the current log level)
     */
    var defaultLogHandler = function (instance, logType) {
        var args = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
        }
        if (logType < instance.logLevel) {
            return;
        }
        var now = new Date().toISOString();
        var method = ConsoleMethod[logType];
        if (method) {
            console[method].apply(console, __spreadArrays(["[" + now + "]  " + instance.name + ":"], args));
        }
        else {
            throw new Error("Attempted to log a message with an invalid logType (value: " + logType + ")");
        }
    };
    var Logger = /** @class */ (function () {
        /**
         * Gives you an instance of a Logger to capture messages according to
         * Firebase's logging scheme.
         *
         * @param name The name that the logs will be associated with
         */
        function Logger(name) {
            this.name = name;
            /**
             * The log level of the given Logger instance.
             */
            this._logLevel = defaultLogLevel;
            /**
             * The main (internal) log handler for the Logger instance.
             * Can be set to a new function in internal package code but not by user.
             */
            this._logHandler = defaultLogHandler;
            /**
             * The optional, additional, user-defined log handler for the Logger instance.
             */
            this._userLogHandler = null;
        }
        Object.defineProperty(Logger.prototype, "logLevel", {
            get: function () {
                return this._logLevel;
            },
            set: function (val) {
                if (!(val in LogLevel)) {
                    throw new TypeError("Invalid value \"" + val + "\" assigned to `logLevel`");
                }
                this._logLevel = val;
            },
            enumerable: false,
            configurable: true
        });
        // Workaround for setter/getter having to be the same type.
        Logger.prototype.setLogLevel = function (val) {
            this._logLevel = typeof val === 'string' ? levelStringToEnum[val] : val;
        };
        Object.defineProperty(Logger.prototype, "logHandler", {
            get: function () {
                return this._logHandler;
            },
            set: function (val) {
                if (typeof val !== 'function') {
                    throw new TypeError('Value assigned to `logHandler` must be a function');
                }
                this._logHandler = val;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(Logger.prototype, "userLogHandler", {
            get: function () {
                return this._userLogHandler;
            },
            set: function (val) {
                this._userLogHandler = val;
            },
            enumerable: false,
            configurable: true
        });
        /**
         * The functions below are all based on the `console` interface
         */
        Logger.prototype.debug = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays([this, LogLevel.DEBUG], args));
            this._logHandler.apply(this, __spreadArrays([this, LogLevel.DEBUG], args));
        };
        Logger.prototype.log = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays([this, LogLevel.VERBOSE], args));
            this._logHandler.apply(this, __spreadArrays([this, LogLevel.VERBOSE], args));
        };
        Logger.prototype.info = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays([this, LogLevel.INFO], args));
            this._logHandler.apply(this, __spreadArrays([this, LogLevel.INFO], args));
        };
        Logger.prototype.warn = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays([this, LogLevel.WARN], args));
            this._logHandler.apply(this, __spreadArrays([this, LogLevel.WARN], args));
        };
        Logger.prototype.error = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            this._userLogHandler && this._userLogHandler.apply(this, __spreadArrays([this, LogLevel.ERROR], args));
            this._logHandler.apply(this, __spreadArrays([this, LogLevel.ERROR], args));
        };
        return Logger;
    }());

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    class PlatformLoggerServiceImpl {
        constructor(container) {
            this.container = container;
        }
        // In initial implementation, this will be called by installations on
        // auth token refresh, and installations will send this string.
        getPlatformInfoString() {
            const providers = this.container.getProviders();
            // Loop through providers and get library/version pairs from any that are
            // version components.
            return providers
                .map(provider => {
                if (isVersionServiceProvider(provider)) {
                    const service = provider.getImmediate();
                    return `${service.library}/${service.version}`;
                }
                else {
                    return null;
                }
            })
                .filter(logString => logString)
                .join(' ');
        }
    }
    /**
     *
     * @param provider check if this provider provides a VersionService
     *
     * NOTE: Using Provider<'app-version'> is a hack to indicate that the provider
     * provides VersionService. The provider is not necessarily a 'app-version'
     * provider.
     */
    function isVersionServiceProvider(provider) {
        const component = provider.getComponent();
        return (component === null || component === void 0 ? void 0 : component.type) === "VERSION" /* VERSION */;
    }

    const name$o = "@firebase/app";
    const version$1 = "0.7.0";

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    const logger = new Logger('@firebase/app');

    const name$n = "@firebase/app-compat";

    const name$m = "@firebase/analytics-compat";

    const name$l = "@firebase/analytics";

    const name$k = "@firebase/app-check-compat";

    const name$j = "@firebase/app-check";

    const name$i = "@firebase/auth";

    const name$h = "@firebase/auth-compat";

    const name$g = "@firebase/database";

    const name$f = "@firebase/database-compat";

    const name$e = "@firebase/functions";

    const name$d = "@firebase/functions-compat";

    const name$c = "@firebase/installations";

    const name$b = "@firebase/installations-compat";

    const name$a = "@firebase/messaging";

    const name$9 = "@firebase/messaging-compat";

    const name$8 = "@firebase/performance";

    const name$7 = "@firebase/performance-compat";

    const name$6 = "@firebase/remote-config";

    const name$5 = "@firebase/remote-config-compat";

    const name$4 = "@firebase/storage";

    const name$3 = "@firebase/storage-compat";

    const name$2 = "@firebase/firestore";

    const name$1 = "@firebase/firestore-compat";

    const name = "firebase";
    const version = "9.0.0";

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * The default app name
     *
     * @internal
     */
    const DEFAULT_ENTRY_NAME$1 = '[DEFAULT]';
    const PLATFORM_LOG_STRING = {
        [name$o]: 'fire-core',
        [name$n]: 'fire-core-compat',
        [name$l]: 'fire-analytics',
        [name$m]: 'fire-analytics-compat',
        [name$j]: 'fire-app-check',
        [name$k]: 'fire-app-check-compat',
        [name$i]: 'fire-auth',
        [name$h]: 'fire-auth-compat',
        [name$g]: 'fire-rtdb',
        [name$f]: 'fire-rtdb-compat',
        [name$e]: 'fire-fn',
        [name$d]: 'fire-fn-compat',
        [name$c]: 'fire-iid',
        [name$b]: 'fire-iid-compat',
        [name$a]: 'fire-fcm',
        [name$9]: 'fire-fcm-compat',
        [name$8]: 'fire-perf',
        [name$7]: 'fire-perf-compat',
        [name$6]: 'fire-rc',
        [name$5]: 'fire-rc-compat',
        [name$4]: 'fire-gcs',
        [name$3]: 'fire-gcs-compat',
        [name$2]: 'fire-fst',
        [name$1]: 'fire-fst-compat',
        'fire-js': 'fire-js',
        [name]: 'fire-js-all'
    };

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * @internal
     */
    const _apps = new Map();
    /**
     * Registered components.
     *
     * @internal
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _components = new Map();
    /**
     * @param component - the component being added to this app's container
     *
     * @internal
     */
    function _addComponent(app, component) {
        try {
            app.container.addComponent(component);
        }
        catch (e) {
            logger.debug(`Component ${component.name} failed to register with FirebaseApp ${app.name}`, e);
        }
    }
    /**
     *
     * @param component - the component to register
     * @returns whether or not the component is registered successfully
     *
     * @internal
     */
    function _registerComponent(component) {
        const componentName = component.name;
        if (_components.has(componentName)) {
            logger.debug(`There were multiple attempts to register component ${componentName}.`);
            return false;
        }
        _components.set(componentName, component);
        // add the component to existing app instances
        for (const app of _apps.values()) {
            _addComponent(app, component);
        }
        return true;
    }
    /**
     *
     * @param app - FirebaseApp instance
     * @param name - service name
     *
     * @returns the provider for the service with the matching name
     *
     * @internal
     */
    function _getProvider(app, name) {
        return app.container.getProvider(name);
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    const ERRORS = {
        ["no-app" /* NO_APP */]: "No Firebase App '{$appName}' has been created - " +
            'call Firebase App.initializeApp()',
        ["bad-app-name" /* BAD_APP_NAME */]: "Illegal App name: '{$appName}",
        ["duplicate-app" /* DUPLICATE_APP */]: "Firebase App named '{$appName}' already exists with different options or config",
        ["app-deleted" /* APP_DELETED */]: "Firebase App named '{$appName}' already deleted",
        ["invalid-app-argument" /* INVALID_APP_ARGUMENT */]: 'firebase.{$appName}() takes either no argument or a ' +
            'Firebase App instance.',
        ["invalid-log-argument" /* INVALID_LOG_ARGUMENT */]: 'First argument to `onLog` must be null or a function.'
    };
    const ERROR_FACTORY = new ErrorFactory('app', 'Firebase', ERRORS);

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    class FirebaseAppImpl {
        constructor(options, config, container) {
            this._isDeleted = false;
            this._options = Object.assign({}, options);
            this._config = Object.assign({}, config);
            this._name = config.name;
            this._automaticDataCollectionEnabled =
                config.automaticDataCollectionEnabled;
            this._container = container;
            this.container.addComponent(new Component('app', () => this, "PUBLIC" /* PUBLIC */));
        }
        get automaticDataCollectionEnabled() {
            this.checkDestroyed();
            return this._automaticDataCollectionEnabled;
        }
        set automaticDataCollectionEnabled(val) {
            this.checkDestroyed();
            this._automaticDataCollectionEnabled = val;
        }
        get name() {
            this.checkDestroyed();
            return this._name;
        }
        get options() {
            this.checkDestroyed();
            return this._options;
        }
        get config() {
            this.checkDestroyed();
            return this._config;
        }
        get container() {
            return this._container;
        }
        get isDeleted() {
            return this._isDeleted;
        }
        set isDeleted(val) {
            this._isDeleted = val;
        }
        /**
         * This function will throw an Error if the App has already been deleted -
         * use before performing API actions on the App.
         */
        checkDestroyed() {
            if (this.isDeleted) {
                throw ERROR_FACTORY.create("app-deleted" /* APP_DELETED */, { appName: this._name });
            }
        }
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * The current SDK version.
     *
     * @public
     */
    const SDK_VERSION = version;
    function initializeApp(options, rawConfig = {}) {
        if (typeof rawConfig !== 'object') {
            const name = rawConfig;
            rawConfig = { name };
        }
        const config = Object.assign({ name: DEFAULT_ENTRY_NAME$1, automaticDataCollectionEnabled: false }, rawConfig);
        const name = config.name;
        if (typeof name !== 'string' || !name) {
            throw ERROR_FACTORY.create("bad-app-name" /* BAD_APP_NAME */, {
                appName: String(name)
            });
        }
        const existingApp = _apps.get(name);
        if (existingApp) {
            // return the existing app if options and config deep equal the ones in the existing app.
            if (deepEqual(options, existingApp.options) &&
                deepEqual(config, existingApp.config)) {
                return existingApp;
            }
            else {
                throw ERROR_FACTORY.create("duplicate-app" /* DUPLICATE_APP */, { appName: name });
            }
        }
        const container = new ComponentContainer(name);
        for (const component of _components.values()) {
            container.addComponent(component);
        }
        const newApp = new FirebaseAppImpl(options, config, container);
        _apps.set(name, newApp);
        return newApp;
    }
    /**
     * Retrieves a {@link @firebase/app#FirebaseApp} instance.
     *
     * When called with no arguments, the default app is returned. When an app name
     * is provided, the app corresponding to that name is returned.
     *
     * An exception is thrown if the app being retrieved has not yet been
     * initialized.
     *
     * @example
     * ```javascript
     * // Return the default app
     * const app = getApp();
     * ```
     *
     * @example
     * ```javascript
     * // Return a named app
     * const otherApp = getApp("otherApp");
     * ```
     *
     * @param name - Optional name of the app to return. If no name is
     *   provided, the default is `"[DEFAULT]"`.
     *
     * @returns The app corresponding to the provided app name.
     *   If no app name is provided, the default app is returned.
     *
     * @public
     */
    function getApp(name = DEFAULT_ENTRY_NAME$1) {
        const app = _apps.get(name);
        if (!app) {
            throw ERROR_FACTORY.create("no-app" /* NO_APP */, { appName: name });
        }
        return app;
    }
    /**
     * Registers a library's name and version for platform logging purposes.
     * @param library - Name of 1p or 3p library (e.g. firestore, angularfire)
     * @param version - Current version of that library.
     * @param variant - Bundle variant, e.g., node, rn, etc.
     *
     * @public
     */
    function registerVersion(libraryKeyOrName, version, variant) {
        var _a;
        // TODO: We can use this check to whitelist strings when/if we set up
        // a good whitelist system.
        let library = (_a = PLATFORM_LOG_STRING[libraryKeyOrName]) !== null && _a !== void 0 ? _a : libraryKeyOrName;
        if (variant) {
            library += `-${variant}`;
        }
        const libraryMismatch = library.match(/\s|\//);
        const versionMismatch = version.match(/\s|\//);
        if (libraryMismatch || versionMismatch) {
            const warning = [
                `Unable to register library "${library}" with version "${version}":`
            ];
            if (libraryMismatch) {
                warning.push(`library name "${library}" contains illegal characters (whitespace or "/")`);
            }
            if (libraryMismatch && versionMismatch) {
                warning.push('and');
            }
            if (versionMismatch) {
                warning.push(`version name "${version}" contains illegal characters (whitespace or "/")`);
            }
            logger.warn(warning.join(' '));
            return;
        }
        _registerComponent(new Component(`${library}-version`, () => ({ library, version }), "VERSION" /* VERSION */));
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    function registerCoreComponents(variant) {
        _registerComponent(new Component('platform-logger', container => new PlatformLoggerServiceImpl(container), "PRIVATE" /* PRIVATE */));
        // Register `app` package.
        registerVersion(name$o, version$1, variant);
        // Register platform SDK identifier (no version).
        registerVersion('fire-js', '');
    }

    /**
     * Firebase App
     *
     * @remarks This package coordinates the communication between the different Firebase components
     * @packageDocumentation
     */
    registerCoreComponents();

    var name$p = "firebase";
    var version$2 = "9.0.1";

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    registerVersion(name$p, version$2, 'app');

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics$1 = function(d, b) {
        extendStatics$1 = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics$1(d, b);
    };

    function __extends$1(d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics$1(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    function __values$1(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    var k, goog = goog || {}, l = commonjsGlobal || self;
    function aa() { }
    function ba(a) { var b = typeof a; b = "object" != b ? b : a ? Array.isArray(a) ? "array" : b : "null"; return "array" == b || "object" == b && "number" == typeof a.length; }
    function p(a) { var b = typeof a; return "object" == b && null != a || "function" == b; }
    function da(a) { return Object.prototype.hasOwnProperty.call(a, ea) && a[ea] || (a[ea] = ++fa); }
    var ea = "closure_uid_" + (1E9 * Math.random() >>> 0), fa = 0;
    function ha(a, b, c) { return a.call.apply(a.bind, arguments); }
    function ia(a, b, c) { if (!a)
        throw Error(); if (2 < arguments.length) {
        var d = Array.prototype.slice.call(arguments, 2);
        return function () { var e = Array.prototype.slice.call(arguments); Array.prototype.unshift.apply(e, d); return a.apply(b, e); };
    } return function () { return a.apply(b, arguments); }; }
    function q(a, b, c) { Function.prototype.bind && -1 != Function.prototype.bind.toString().indexOf("native code") ? q = ha : q = ia; return q.apply(null, arguments); }
    function ja(a, b) { var c = Array.prototype.slice.call(arguments, 1); return function () { var d = c.slice(); d.push.apply(d, arguments); return a.apply(this, d); }; }
    function t(a, b) { function c() { } c.prototype = b.prototype; a.Z = b.prototype; a.prototype = new c; a.prototype.constructor = a; a.Vb = function (d, e, f) { for (var h = Array(arguments.length - 2), n = 2; n < arguments.length; n++)
        h[n - 2] = arguments[n]; return b.prototype[e].apply(d, h); }; }
    function v() { this.s = this.s; this.o = this.o; }
    var ka = 0;
    v.prototype.s = !1;
    v.prototype.na = function () { if (!this.s && (this.s = !0, this.M(), 0 != ka)) {
        var a = da(this);
    } };
    v.prototype.M = function () { if (this.o)
        for (; this.o.length;)
            this.o.shift()(); };
    var ma = Array.prototype.indexOf ? function (a, b) { return Array.prototype.indexOf.call(a, b, void 0); } : function (a, b) { if ("string" === typeof a)
        return "string" !== typeof b || 1 != b.length ? -1 : a.indexOf(b, 0); for (var c = 0; c < a.length; c++)
        if (c in a && a[c] === b)
            return c; return -1; }, na = Array.prototype.forEach ? function (a, b, c) { Array.prototype.forEach.call(a, b, c); } : function (a, b, c) { var d = a.length, e = "string" === typeof a ? a.split("") : a; for (var f = 0; f < d; f++)
        f in e && b.call(c, e[f], f, a); };
    function oa(a) { a: {
        var b = pa;
        var c = a.length, d = "string" === typeof a ? a.split("") : a;
        for (var e = 0; e < c; e++)
            if (e in d && b.call(void 0, d[e], e, a)) {
                b = e;
                break a;
            }
        b = -1;
    } return 0 > b ? null : "string" === typeof a ? a.charAt(b) : a[b]; }
    function qa(a) { return Array.prototype.concat.apply([], arguments); }
    function ra(a) { var b = a.length; if (0 < b) {
        var c = Array(b);
        for (var d = 0; d < b; d++)
            c[d] = a[d];
        return c;
    } return []; }
    function sa(a) { return /^[\s\xa0]*$/.test(a); }
    var ta = String.prototype.trim ? function (a) { return a.trim(); } : function (a) { return /^[\s\xa0]*([\s\S]*?)[\s\xa0]*$/.exec(a)[1]; };
    function w(a, b) { return -1 != a.indexOf(b); }
    function ua(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    var x;
    a: {
        var va = l.navigator;
        if (va) {
            var wa = va.userAgent;
            if (wa) {
                x = wa;
                break a;
            }
        }
        x = "";
    }
    function xa(a, b, c) { for (var d in a)
        b.call(c, a[d], d, a); }
    function ya(a) { var b = {}; for (var c in a)
        b[c] = a[c]; return b; }
    var za = "constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");
    function Aa(a, b) { var c, d; for (var e = 1; e < arguments.length; e++) {
        d = arguments[e];
        for (c in d)
            a[c] = d[c];
        for (var f = 0; f < za.length; f++)
            c = za[f], Object.prototype.hasOwnProperty.call(d, c) && (a[c] = d[c]);
    } }
    function Ca(a) { Ca[" "](a); return a; }
    Ca[" "] = aa;
    function Fa(a) { var b = Ga; return Object.prototype.hasOwnProperty.call(b, 9) ? b[9] : b[9] = a(9); }
    var Ha = w(x, "Opera"), y = w(x, "Trident") || w(x, "MSIE"), Ia = w(x, "Edge"), Ja = Ia || y, Ka = w(x, "Gecko") && !(w(x.toLowerCase(), "webkit") && !w(x, "Edge")) && !(w(x, "Trident") || w(x, "MSIE")) && !w(x, "Edge"), La = w(x.toLowerCase(), "webkit") && !w(x, "Edge");
    function Ma() { var a = l.document; return a ? a.documentMode : void 0; }
    var Na;
    a: {
        var Oa = "", Pa = function () { var a = x; if (Ka)
            return /rv:([^\);]+)(\)|;)/.exec(a); if (Ia)
            return /Edge\/([\d\.]+)/.exec(a); if (y)
            return /\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/.exec(a); if (La)
            return /WebKit\/(\S+)/.exec(a); if (Ha)
            return /(?:Version)[ \/]?(\S+)/.exec(a); }();
        Pa && (Oa = Pa ? Pa[1] : "");
        if (y) {
            var Qa = Ma();
            if (null != Qa && Qa > parseFloat(Oa)) {
                Na = String(Qa);
                break a;
            }
        }
        Na = Oa;
    }
    var Ga = {};
    function Ra() { return Fa(function () { var a = 0; var b = ta(String(Na)).split("."), c = ta("9").split("."), d = Math.max(b.length, c.length); for (var h = 0; 0 == a && h < d; h++) {
        var e = b[h] || "", f = c[h] || "";
        do {
            e = /(\d*)(\D*)(.*)/.exec(e) || ["", "", "", ""];
            f = /(\d*)(\D*)(.*)/.exec(f) || ["", "", "", ""];
            if (0 == e[0].length && 0 == f[0].length)
                break;
            a = ua(0 == e[1].length ? 0 : parseInt(e[1], 10), 0 == f[1].length ? 0 : parseInt(f[1], 10)) || ua(0 == e[2].length, 0 == f[2].length) || ua(e[2], f[2]);
            e = e[3];
            f = f[3];
        } while (0 == a);
    } return 0 <= a; }); }
    var Sa;
    if (l.document && y) {
        var Ta = Ma();
        Sa = Ta ? Ta : parseInt(Na, 10) || void 0;
    }
    else
        Sa = void 0;
    var Ua = Sa;
    var Va = function () { if (!l.addEventListener || !Object.defineProperty)
        return !1; var a = !1, b = Object.defineProperty({}, "passive", { get: function () { a = !0; } }); try {
        l.addEventListener("test", aa, b), l.removeEventListener("test", aa, b);
    }
    catch (c) { } return a; }();
    function z(a, b) { this.type = a; this.g = this.target = b; this.defaultPrevented = !1; }
    z.prototype.h = function () { this.defaultPrevented = !0; };
    function A(a, b) {
        z.call(this, a ? a.type : "");
        this.relatedTarget = this.g = this.target = null;
        this.button = this.screenY = this.screenX = this.clientY = this.clientX = 0;
        this.key = "";
        this.metaKey = this.shiftKey = this.altKey = this.ctrlKey = !1;
        this.state = null;
        this.pointerId = 0;
        this.pointerType = "";
        this.i = null;
        if (a) {
            var c = this.type = a.type, d = a.changedTouches && a.changedTouches.length ? a.changedTouches[0] : null;
            this.target = a.target || a.srcElement;
            this.g = b;
            if (b = a.relatedTarget) {
                if (Ka) {
                    a: {
                        try {
                            Ca(b.nodeName);
                            var e = !0;
                            break a;
                        }
                        catch (f) { }
                        e =
                            !1;
                    }
                    e || (b = null);
                }
            }
            else
                "mouseover" == c ? b = a.fromElement : "mouseout" == c && (b = a.toElement);
            this.relatedTarget = b;
            d ? (this.clientX = void 0 !== d.clientX ? d.clientX : d.pageX, this.clientY = void 0 !== d.clientY ? d.clientY : d.pageY, this.screenX = d.screenX || 0, this.screenY = d.screenY || 0) : (this.clientX = void 0 !== a.clientX ? a.clientX : a.pageX, this.clientY = void 0 !== a.clientY ? a.clientY : a.pageY, this.screenX = a.screenX || 0, this.screenY = a.screenY || 0);
            this.button = a.button;
            this.key = a.key || "";
            this.ctrlKey = a.ctrlKey;
            this.altKey = a.altKey;
            this.shiftKey =
                a.shiftKey;
            this.metaKey = a.metaKey;
            this.pointerId = a.pointerId || 0;
            this.pointerType = "string" === typeof a.pointerType ? a.pointerType : Wa[a.pointerType] || "";
            this.state = a.state;
            this.i = a;
            a.defaultPrevented && A.Z.h.call(this);
        }
    }
    t(A, z);
    var Wa = { 2: "touch", 3: "pen", 4: "mouse" };
    A.prototype.h = function () { A.Z.h.call(this); var a = this.i; a.preventDefault ? a.preventDefault() : a.returnValue = !1; };
    var B = "closure_listenable_" + (1E6 * Math.random() | 0);
    var Xa = 0;
    function Ya(a, b, c, d, e) { this.listener = a; this.proxy = null; this.src = b; this.type = c; this.capture = !!d; this.ia = e; this.key = ++Xa; this.ca = this.fa = !1; }
    function Za(a) { a.ca = !0; a.listener = null; a.proxy = null; a.src = null; a.ia = null; }
    function $a(a) { this.src = a; this.g = {}; this.h = 0; }
    $a.prototype.add = function (a, b, c, d, e) { var f = a.toString(); a = this.g[f]; a || (a = this.g[f] = [], this.h++); var h = ab(a, b, d, e); -1 < h ? (b = a[h], c || (b.fa = !1)) : (b = new Ya(b, this.src, f, !!d, e), b.fa = c, a.push(b)); return b; };
    function bb(a, b) { var c = b.type; if (c in a.g) {
        var d = a.g[c], e = ma(d, b), f;
        (f = 0 <= e) && Array.prototype.splice.call(d, e, 1);
        f && (Za(b), 0 == a.g[c].length && (delete a.g[c], a.h--));
    } }
    function ab(a, b, c, d) { for (var e = 0; e < a.length; ++e) {
        var f = a[e];
        if (!f.ca && f.listener == b && f.capture == !!c && f.ia == d)
            return e;
    } return -1; }
    var cb = "closure_lm_" + (1E6 * Math.random() | 0), db = {};
    function fb(a, b, c, d, e) { if (d && d.once)
        return gb(a, b, c, d, e); if (Array.isArray(b)) {
        for (var f = 0; f < b.length; f++)
            fb(a, b[f], c, d, e);
        return null;
    } c = hb(c); return a && a[B] ? a.N(b, c, p(d) ? !!d.capture : !!d, e) : ib(a, b, c, !1, d, e); }
    function ib(a, b, c, d, e, f) { if (!b)
        throw Error("Invalid event type"); var h = p(e) ? !!e.capture : !!e, n = jb(a); n || (a[cb] = n = new $a(a)); c = n.add(b, c, d, h, f); if (c.proxy)
        return c; d = kb(); c.proxy = d; d.src = a; d.listener = c; if (a.addEventListener)
        Va || (e = h), void 0 === e && (e = !1), a.addEventListener(b.toString(), d, e);
    else if (a.attachEvent)
        a.attachEvent(lb(b.toString()), d);
    else if (a.addListener && a.removeListener)
        a.addListener(d);
    else
        throw Error("addEventListener and attachEvent are unavailable."); return c; }
    function kb() { function a(c) { return b.call(a.src, a.listener, c); } var b = mb; return a; }
    function gb(a, b, c, d, e) { if (Array.isArray(b)) {
        for (var f = 0; f < b.length; f++)
            gb(a, b[f], c, d, e);
        return null;
    } c = hb(c); return a && a[B] ? a.O(b, c, p(d) ? !!d.capture : !!d, e) : ib(a, b, c, !0, d, e); }
    function nb(a, b, c, d, e) { if (Array.isArray(b))
        for (var f = 0; f < b.length; f++)
            nb(a, b[f], c, d, e);
    else
        (d = p(d) ? !!d.capture : !!d, c = hb(c), a && a[B]) ? (a = a.i, b = String(b).toString(), b in a.g && (f = a.g[b], c = ab(f, c, d, e), -1 < c && (Za(f[c]), Array.prototype.splice.call(f, c, 1), 0 == f.length && (delete a.g[b], a.h--)))) : a && (a = jb(a)) && (b = a.g[b.toString()], a = -1, b && (a = ab(b, c, d, e)), (c = -1 < a ? b[a] : null) && ob(c)); }
    function ob(a) { if ("number" !== typeof a && a && !a.ca) {
        var b = a.src;
        if (b && b[B])
            bb(b.i, a);
        else {
            var c = a.type, d = a.proxy;
            b.removeEventListener ? b.removeEventListener(c, d, a.capture) : b.detachEvent ? b.detachEvent(lb(c), d) : b.addListener && b.removeListener && b.removeListener(d);
            (c = jb(b)) ? (bb(c, a), 0 == c.h && (c.src = null, b[cb] = null)) : Za(a);
        }
    } }
    function lb(a) { return a in db ? db[a] : db[a] = "on" + a; }
    function mb(a, b) { if (a.ca)
        a = !0;
    else {
        b = new A(b, this);
        var c = a.listener, d = a.ia || a.src;
        a.fa && ob(a);
        a = c.call(d, b);
    } return a; }
    function jb(a) { a = a[cb]; return a instanceof $a ? a : null; }
    var pb = "__closure_events_fn_" + (1E9 * Math.random() >>> 0);
    function hb(a) { if ("function" === typeof a)
        return a; a[pb] || (a[pb] = function (b) { return a.handleEvent(b); }); return a[pb]; }
    function C() { v.call(this); this.i = new $a(this); this.P = this; this.I = null; }
    t(C, v);
    C.prototype[B] = !0;
    C.prototype.removeEventListener = function (a, b, c, d) { nb(this, a, b, c, d); };
    function D(a, b) { var c, d = a.I; if (d)
        for (c = []; d; d = d.I)
            c.push(d); a = a.P; d = b.type || b; if ("string" === typeof b)
        b = new z(b, a);
    else if (b instanceof z)
        b.target = b.target || a;
    else {
        var e = b;
        b = new z(d, a);
        Aa(b, e);
    } e = !0; if (c)
        for (var f = c.length - 1; 0 <= f; f--) {
            var h = b.g = c[f];
            e = qb(h, d, !0, b) && e;
        } h = b.g = a; e = qb(h, d, !0, b) && e; e = qb(h, d, !1, b) && e; if (c)
        for (f = 0; f < c.length; f++)
            h = b.g = c[f], e = qb(h, d, !1, b) && e; }
    C.prototype.M = function () { C.Z.M.call(this); if (this.i) {
        var a = this.i, c;
        for (c in a.g) {
            for (var d = a.g[c], e = 0; e < d.length; e++)
                Za(d[e]);
            delete a.g[c];
            a.h--;
        }
    } this.I = null; };
    C.prototype.N = function (a, b, c, d) { return this.i.add(String(a), b, !1, c, d); };
    C.prototype.O = function (a, b, c, d) { return this.i.add(String(a), b, !0, c, d); };
    function qb(a, b, c, d) { b = a.i.g[String(b)]; if (!b)
        return !0; b = b.concat(); for (var e = !0, f = 0; f < b.length; ++f) {
        var h = b[f];
        if (h && !h.ca && h.capture == c) {
            var n = h.listener, u = h.ia || h.src;
            h.fa && bb(a.i, h);
            e = !1 !== n.call(u, d) && e;
        }
    } return e && !d.defaultPrevented; }
    var rb = l.JSON.stringify;
    function sb() { var a = tb; var b = null; a.g && (b = a.g, a.g = a.g.next, a.g || (a.h = null), b.next = null); return b; }
    var ub = /** @class */ (function () {
        function ub() {
            this.h = this.g = null;
        }
        ub.prototype.add = function (a, b) { var c = vb.get(); c.set(a, b); this.h ? this.h.next = c : this.g = c; this.h = c; };
        return ub;
    }());
    var vb = new /** @class */ (function () {
        function class_2(a, b) {
            this.i = a;
            this.j = b;
            this.h = 0;
            this.g = null;
        }
        class_2.prototype.get = function () { var a; 0 < this.h ? (this.h--, a = this.g, this.g = a.next, a.next = null) : a = this.i(); return a; };
        return class_2;
    }())(function () { return new wb; }, function (a) { return a.reset(); });
    var wb = /** @class */ (function () {
        function wb() {
            this.next = this.g = this.h = null;
        }
        wb.prototype.set = function (a, b) { this.h = a; this.g = b; this.next = null; };
        wb.prototype.reset = function () { this.next = this.g = this.h = null; };
        return wb;
    }());
    function yb(a) { l.setTimeout(function () { throw a; }, 0); }
    function zb(a, b) { Ab || Bb(); Cb || (Ab(), Cb = !0); tb.add(a, b); }
    var Ab;
    function Bb() { var a = l.Promise.resolve(void 0); Ab = function () { a.then(Db); }; }
    var Cb = !1, tb = new ub;
    function Db() { for (var a; a = sb();) {
        try {
            a.h.call(a.g);
        }
        catch (c) {
            yb(c);
        }
        var b = vb;
        b.j(a);
        100 > b.h && (b.h++, a.next = b.g, b.g = a);
    } Cb = !1; }
    function Eb(a, b) { C.call(this); this.h = a || 1; this.g = b || l; this.j = q(this.kb, this); this.l = Date.now(); }
    t(Eb, C);
    k = Eb.prototype;
    k.da = !1;
    k.S = null;
    k.kb = function () { if (this.da) {
        var a = Date.now() - this.l;
        0 < a && a < .8 * this.h ? this.S = this.g.setTimeout(this.j, this.h - a) : (this.S && (this.g.clearTimeout(this.S), this.S = null), D(this, "tick"), this.da && (Fb(this), this.start()));
    } };
    k.start = function () { this.da = !0; this.S || (this.S = this.g.setTimeout(this.j, this.h), this.l = Date.now()); };
    function Fb(a) { a.da = !1; a.S && (a.g.clearTimeout(a.S), a.S = null); }
    k.M = function () { Eb.Z.M.call(this); Fb(this); delete this.g; };
    function Gb(a, b, c) { if ("function" === typeof a)
        c && (a = q(a, c));
    else if (a && "function" == typeof a.handleEvent)
        a = q(a.handleEvent, a);
    else
        throw Error("Invalid listener argument"); return 2147483647 < Number(b) ? -1 : l.setTimeout(a, b || 0); }
    function Hb(a) { a.g = Gb(function () { a.g = null; a.i && (a.i = !1, Hb(a)); }, a.j); var b = a.h; a.h = null; a.m.apply(null, b); }
    var Ib = /** @class */ (function (_super) {
        __extends$1(Ib, _super);
        function Ib(a, b) {
            var _this = _super.call(this) || this;
            _this.m = a;
            _this.j = b;
            _this.h = null;
            _this.i = !1;
            _this.g = null;
            return _this;
        }
        Ib.prototype.l = function (a) { this.h = arguments; this.g ? this.i = !0 : Hb(this); };
        Ib.prototype.M = function () { _super.prototype.M.call(this); this.g && (l.clearTimeout(this.g), this.g = null, this.i = !1, this.h = null); };
        return Ib;
    }(v));
    function E(a) { v.call(this); this.h = a; this.g = {}; }
    t(E, v);
    var Jb = [];
    function Kb(a, b, c, d) { Array.isArray(c) || (c && (Jb[0] = c.toString()), c = Jb); for (var e = 0; e < c.length; e++) {
        var f = fb(b, c[e], d || a.handleEvent, !1, a.h || a);
        if (!f)
            break;
        a.g[f.key] = f;
    } }
    function Lb(a) { xa(a.g, function (b, c) { this.g.hasOwnProperty(c) && ob(b); }, a); a.g = {}; }
    E.prototype.M = function () { E.Z.M.call(this); Lb(this); };
    E.prototype.handleEvent = function () { throw Error("EventHandler.handleEvent not implemented"); };
    function Mb() { this.g = !0; }
    Mb.prototype.Aa = function () { this.g = !1; };
    function Nb(a, b, c, d, e, f) { a.info(function () { if (a.g)
        if (f) {
            var h = "";
            for (var n = f.split("&"), u = 0; u < n.length; u++) {
                var m = n[u].split("=");
                if (1 < m.length) {
                    var r = m[0];
                    m = m[1];
                    var G = r.split("_");
                    h = 2 <= G.length && "type" == G[1] ? h + (r + "=" + m + "&") : h + (r + "=redacted&");
                }
            }
        }
        else
            h = null;
    else
        h = f; return "XMLHTTP REQ (" + d + ") [attempt " + e + "]: " + b + "\n" + c + "\n" + h; }); }
    function Ob(a, b, c, d, e, f, h) { a.info(function () { return "XMLHTTP RESP (" + d + ") [ attempt " + e + "]: " + b + "\n" + c + "\n" + f + " " + h; }); }
    function F(a, b, c, d) { a.info(function () { return "XMLHTTP TEXT (" + b + "): " + Pb(a, c) + (d ? " " + d : ""); }); }
    function Qb(a, b) { a.info(function () { return "TIMEOUT: " + b; }); }
    Mb.prototype.info = function () { };
    function Pb(a, b) { if (!a.g)
        return b; if (!b)
        return null; try {
        var c = JSON.parse(b);
        if (c)
            for (a = 0; a < c.length; a++)
                if (Array.isArray(c[a])) {
                    var d = c[a];
                    if (!(2 > d.length)) {
                        var e = d[1];
                        if (Array.isArray(e) && !(1 > e.length)) {
                            var f = e[0];
                            if ("noop" != f && "stop" != f && "close" != f)
                                for (var h = 1; h < e.length; h++)
                                    e[h] = "";
                        }
                    }
                }
        return rb(c);
    }
    catch (n) {
        return b;
    } }
    var H = {}, Rb = null;
    function Sb() { return Rb = Rb || new C; }
    H.Ma = "serverreachability";
    function Tb(a) { z.call(this, H.Ma, a); }
    t(Tb, z);
    function I(a) { var b = Sb(); D(b, new Tb(b, a)); }
    H.STAT_EVENT = "statevent";
    function Ub(a, b) { z.call(this, H.STAT_EVENT, a); this.stat = b; }
    t(Ub, z);
    function J(a) { var b = Sb(); D(b, new Ub(b, a)); }
    H.Na = "timingevent";
    function Vb(a, b) { z.call(this, H.Na, a); this.size = b; }
    t(Vb, z);
    function K(a, b) { if ("function" !== typeof a)
        throw Error("Fn must not be null and must be a function"); return l.setTimeout(function () { a(); }, b); }
    var Wb = { NO_ERROR: 0, lb: 1, yb: 2, xb: 3, sb: 4, wb: 5, zb: 6, Ja: 7, TIMEOUT: 8, Cb: 9 };
    var Xb = { qb: "complete", Mb: "success", Ka: "error", Ja: "abort", Eb: "ready", Fb: "readystatechange", TIMEOUT: "timeout", Ab: "incrementaldata", Db: "progress", tb: "downloadprogress", Ub: "uploadprogress" };
    function Yb() { }
    Yb.prototype.h = null;
    function Zb(a) { return a.h || (a.h = a.i()); }
    function $b() { }
    var L = { OPEN: "a", pb: "b", Ka: "c", Bb: "d" };
    function ac() { z.call(this, "d"); }
    t(ac, z);
    function bc() { z.call(this, "c"); }
    t(bc, z);
    var cc;
    function dc() { }
    t(dc, Yb);
    dc.prototype.g = function () { return new XMLHttpRequest; };
    dc.prototype.i = function () { return {}; };
    cc = new dc;
    function M(a, b, c, d) { this.l = a; this.j = b; this.m = c; this.X = d || 1; this.V = new E(this); this.P = ec; a = Ja ? 125 : void 0; this.W = new Eb(a); this.H = null; this.i = !1; this.s = this.A = this.v = this.K = this.F = this.Y = this.B = null; this.D = []; this.g = null; this.C = 0; this.o = this.u = null; this.N = -1; this.I = !1; this.O = 0; this.L = null; this.aa = this.J = this.$ = this.U = !1; this.h = new fc; }
    function fc() { this.i = null; this.g = ""; this.h = !1; }
    var ec = 45E3, gc = {}, hc = {};
    k = M.prototype;
    k.setTimeout = function (a) { this.P = a; };
    function ic(a, b, c) { a.K = 1; a.v = jc(N(b)); a.s = c; a.U = !0; kc(a, null); }
    function kc(a, b) { a.F = Date.now(); lc(a); a.A = N(a.v); var c = a.A, d = a.X; Array.isArray(d) || (d = [String(d)]); mc(c.h, "t", d); a.C = 0; c = a.l.H; a.h = new fc; a.g = nc(a.l, c ? b : null, !a.s); 0 < a.O && (a.L = new Ib(q(a.Ia, a, a.g), a.O)); Kb(a.V, a.g, "readystatechange", a.gb); b = a.H ? ya(a.H) : {}; a.s ? (a.u || (a.u = "POST"), b["Content-Type"] = "application/x-www-form-urlencoded", a.g.ea(a.A, a.u, a.s, b)) : (a.u = "GET", a.g.ea(a.A, a.u, null, b)); I(1); Nb(a.j, a.u, a.A, a.m, a.X, a.s); }
    k.gb = function (a) { a = a.target; var b = this.L; b && 3 == O(a) ? b.l() : this.Ia(a); };
    k.Ia = function (a) {
        try {
            if (a == this.g)
                a: {
                    var r = O(this.g);
                    var b = this.g.Da();
                    var G = this.g.ba();
                    if (!(3 > r) && (3 != r || Ja || this.g && (this.h.h || this.g.ga() || oc(this.g)))) {
                        this.I || 4 != r || 7 == b || (8 == b || 0 >= G ? I(3) : I(2));
                        pc(this);
                        var c = this.g.ba();
                        this.N = c;
                        b: if (qc(this)) {
                            var d = oc(this.g);
                            a = "";
                            var e = d.length, f = 4 == O(this.g);
                            if (!this.h.i) {
                                if ("undefined" === typeof TextDecoder) {
                                    P(this);
                                    rc(this);
                                    var h = "";
                                    break b;
                                }
                                this.h.i = new l.TextDecoder;
                            }
                            for (b = 0; b < e; b++)
                                this.h.h = !0, a += this.h.i.decode(d[b], { stream: f && b == e - 1 });
                            d.splice(0, e);
                            this.h.g += a;
                            this.C = 0;
                            h = this.h.g;
                        }
                        else
                            h = this.g.ga();
                        this.i = 200 == c;
                        Ob(this.j, this.u, this.A, this.m, this.X, r, c);
                        if (this.i) {
                            if (this.$ && !this.J) {
                                b: {
                                    if (this.g) {
                                        var n, u = this.g;
                                        if ((n = u.g ? u.g.getResponseHeader("X-HTTP-Initial-Response") : null) && !sa(n)) {
                                            var m = n;
                                            break b;
                                        }
                                    }
                                    m = null;
                                }
                                if (c = m)
                                    F(this.j, this.m, c, "Initial handshake response via X-HTTP-Initial-Response"), this.J = !0, sc(this, c);
                                else {
                                    this.i = !1;
                                    this.o = 3;
                                    J(12);
                                    P(this);
                                    rc(this);
                                    break a;
                                }
                            }
                            this.U ? (tc(this, r, h), Ja && this.i && 3 == r && (Kb(this.V, this.W, "tick", this.fb),
                                this.W.start())) : (F(this.j, this.m, h, null), sc(this, h));
                            4 == r && P(this);
                            this.i && !this.I && (4 == r ? uc(this.l, this) : (this.i = !1, lc(this)));
                        }
                        else
                            400 == c && 0 < h.indexOf("Unknown SID") ? (this.o = 3, J(12)) : (this.o = 0, J(13)), P(this), rc(this);
                    }
                }
        }
        catch (r) { }
        finally { }
    };
    function qc(a) { return a.g ? "GET" == a.u && 2 != a.K && a.l.Ba : !1; }
    function tc(a, b, c) {
        var d = !0, e;
        for (; !a.I && a.C < c.length;)
            if (e = vc(a, c), e == hc) {
                4 == b && (a.o = 4, J(14), d = !1);
                F(a.j, a.m, null, "[Incomplete Response]");
                break;
            }
            else if (e == gc) {
                a.o = 4;
                J(15);
                F(a.j, a.m, c, "[Invalid Chunk]");
                d = !1;
                break;
            }
            else
                F(a.j, a.m, e, null), sc(a, e);
        qc(a) && e != hc && e != gc && (a.h.g = "", a.C = 0);
        4 != b || 0 != c.length || a.h.h || (a.o = 1, J(16), d = !1);
        a.i = a.i && d;
        d ? 0 < c.length && !a.aa && (a.aa = !0, b = a.l, b.g == a && b.$ && !b.L && (b.h.info("Great, no buffering proxy detected. Bytes received: " + c.length), wc(b), b.L = !0, J(11))) : (F(a.j, a.m, c, "[Invalid Chunked Response]"), P(a), rc(a));
    }
    k.fb = function () { if (this.g) {
        var a = O(this.g), b = this.g.ga();
        this.C < b.length && (pc(this), tc(this, a, b), this.i && 4 != a && lc(this));
    } };
    function vc(a, b) { var c = a.C, d = b.indexOf("\n", c); if (-1 == d)
        return hc; c = Number(b.substring(c, d)); if (isNaN(c))
        return gc; d += 1; if (d + c > b.length)
        return hc; b = b.substr(d, c); a.C = d + c; return b; }
    k.cancel = function () { this.I = !0; P(this); };
    function lc(a) { a.Y = Date.now() + a.P; xc(a, a.P); }
    function xc(a, b) { if (null != a.B)
        throw Error("WatchDog timer not null"); a.B = K(q(a.eb, a), b); }
    function pc(a) { a.B && (l.clearTimeout(a.B), a.B = null); }
    k.eb = function () { this.B = null; var a = Date.now(); 0 <= a - this.Y ? (Qb(this.j, this.A), 2 != this.K && (I(3), J(17)), P(this), this.o = 2, rc(this)) : xc(this, this.Y - a); };
    function rc(a) { 0 == a.l.G || a.I || uc(a.l, a); }
    function P(a) { pc(a); var b = a.L; b && "function" == typeof b.na && b.na(); a.L = null; Fb(a.W); Lb(a.V); a.g && (b = a.g, a.g = null, b.abort(), b.na()); }
    function sc(a, b) {
        try {
            var c = a.l;
            if (0 != c.G && (c.g == a || yc(c.i, a)))
                if (c.I = a.N, !a.J && yc(c.i, a) && 3 == c.G) {
                    try {
                        var d = c.Ca.g.parse(b);
                    }
                    catch (m) {
                        d = null;
                    }
                    if (Array.isArray(d) && 3 == d.length) {
                        var e = d;
                        if (0 == e[0])
                            a: {
                                if (!c.u) {
                                    if (c.g)
                                        if (c.g.F + 3E3 < a.F)
                                            zc(c), Ac(c);
                                        else
                                            break a;
                                    Bc(c);
                                    J(18);
                                }
                            }
                        else
                            c.ta = e[1], 0 < c.ta - c.U && 37500 > e[2] && c.N && 0 == c.A && !c.v && (c.v = K(q(c.ab, c), 6E3));
                        if (1 >= Cc(c.i) && c.ka) {
                            try {
                                c.ka();
                            }
                            catch (m) { }
                            c.ka = void 0;
                        }
                    }
                    else
                        Q(c, 11);
                }
                else if ((a.J || c.g == a) && zc(c), !sa(b))
                    for (e = c.Ca.g.parse(b), b = 0; b < e.length; b++) {
                        var m = e[b];
                        c.U = m[0];
                        m = m[1];
                        if (2 == c.G)
                            if ("c" == m[0]) {
                                c.J = m[1];
                                c.la = m[2];
                                var r = m[3];
                                null != r && (c.ma = r, c.h.info("VER=" + c.ma));
                                var G = m[4];
                                null != G && (c.za = G, c.h.info("SVER=" + c.za));
                                var Da = m[5];
                                null != Da && "number" === typeof Da && 0 < Da && (d = 1.5 * Da, c.K = d, c.h.info("backChannelRequestTimeoutMs_=" + d));
                                d = c;
                                var ca = a.g;
                                if (ca) {
                                    var Ea = ca.g ? ca.g.getResponseHeader("X-Client-Wire-Protocol") : null;
                                    if (Ea) {
                                        var f = d.i;
                                        !f.g && (w(Ea, "spdy") || w(Ea, "quic") || w(Ea, "h2")) && (f.j = f.l, f.g = new Set, f.h && (Dc(f, f.h), f.h = null));
                                    }
                                    if (d.D) {
                                        var xb = ca.g ? ca.g.getResponseHeader("X-HTTP-Session-Id") : null;
                                        xb && (d.sa = xb, R(d.F, d.D, xb));
                                    }
                                }
                                c.G = 3;
                                c.j && c.j.xa();
                                c.$ && (c.O = Date.now() - a.F, c.h.info("Handshake RTT: " + c.O + "ms"));
                                d = c;
                                var h = a;
                                d.oa = Ec(d, d.H ? d.la : null, d.W);
                                if (h.J) {
                                    Fc(d.i, h);
                                    var n = h, u = d.K;
                                    u && n.setTimeout(u);
                                    n.B && (pc(n), lc(n));
                                    d.g = h;
                                }
                                else
                                    Gc(d);
                                0 < c.l.length && Hc(c);
                            }
                            else
                                "stop" != m[0] && "close" != m[0] || Q(c, 7);
                        else
                            3 == c.G && ("stop" == m[0] || "close" == m[0] ? "stop" == m[0] ? Q(c, 7) : Ic(c) : "noop" != m[0] && c.j && c.j.wa(m), c.A = 0);
                    }
            I(4);
        }
        catch (m) { }
    }
    function Jc(a) { if (a.R && "function" == typeof a.R)
        return a.R(); if ("string" === typeof a)
        return a.split(""); if (ba(a)) {
        for (var b = [], c = a.length, d = 0; d < c; d++)
            b.push(a[d]);
        return b;
    } b = []; c = 0; for (d in a)
        b[c++] = a[d]; return b; }
    function Kc(a, b) { if (a.forEach && "function" == typeof a.forEach)
        a.forEach(b, void 0);
    else if (ba(a) || "string" === typeof a)
        na(a, b, void 0);
    else {
        if (a.T && "function" == typeof a.T)
            var c = a.T();
        else if (a.R && "function" == typeof a.R)
            c = void 0;
        else if (ba(a) || "string" === typeof a) {
            c = [];
            for (var d = a.length, e = 0; e < d; e++)
                c.push(e);
        }
        else
            for (e in c = [], d = 0, a)
                c[d++] = e;
        d = Jc(a);
        e = d.length;
        for (var f = 0; f < e; f++)
            b.call(void 0, d[f], c && c[f], a);
    } }
    function S(a, b) { this.h = {}; this.g = []; this.i = 0; var c = arguments.length; if (1 < c) {
        if (c % 2)
            throw Error("Uneven number of arguments");
        for (var d = 0; d < c; d += 2)
            this.set(arguments[d], arguments[d + 1]);
    }
    else if (a)
        if (a instanceof S)
            for (c = a.T(), d = 0; d < c.length; d++)
                this.set(c[d], a.get(c[d]));
        else
            for (d in a)
                this.set(d, a[d]); }
    k = S.prototype;
    k.R = function () { Lc(this); for (var a = [], b = 0; b < this.g.length; b++)
        a.push(this.h[this.g[b]]); return a; };
    k.T = function () { Lc(this); return this.g.concat(); };
    function Lc(a) { if (a.i != a.g.length) {
        for (var b = 0, c = 0; b < a.g.length;) {
            var d = a.g[b];
            T(a.h, d) && (a.g[c++] = d);
            b++;
        }
        a.g.length = c;
    } if (a.i != a.g.length) {
        var e = {};
        for (c = b = 0; b < a.g.length;)
            d = a.g[b], T(e, d) || (a.g[c++] = d, e[d] = 1), b++;
        a.g.length = c;
    } }
    k.get = function (a, b) { return T(this.h, a) ? this.h[a] : b; };
    k.set = function (a, b) { T(this.h, a) || (this.i++, this.g.push(a)); this.h[a] = b; };
    k.forEach = function (a, b) { for (var c = this.T(), d = 0; d < c.length; d++) {
        var e = c[d], f = this.get(e);
        a.call(b, f, e, this);
    } };
    function T(a, b) { return Object.prototype.hasOwnProperty.call(a, b); }
    var Mc = /^(?:([^:/?#.]+):)?(?:\/\/(?:([^\\/?#]*)@)?([^\\/?#]*?)(?::([0-9]+))?(?=[\\/?#]|$))?([^?#]+)?(?:\?([^#]*))?(?:#([\s\S]*))?$/;
    function Nc(a, b) { if (a) {
        a = a.split("&");
        for (var c = 0; c < a.length; c++) {
            var d = a[c].indexOf("="), e = null;
            if (0 <= d) {
                var f = a[c].substring(0, d);
                e = a[c].substring(d + 1);
            }
            else
                f = a[c];
            b(f, e ? decodeURIComponent(e.replace(/\+/g, " ")) : "");
        }
    } }
    function U(a, b) { this.i = this.s = this.j = ""; this.m = null; this.o = this.l = ""; this.g = !1; if (a instanceof U) {
        this.g = void 0 !== b ? b : a.g;
        Oc(this, a.j);
        this.s = a.s;
        Pc(this, a.i);
        Qc(this, a.m);
        this.l = a.l;
        b = a.h;
        var c = new Rc;
        c.i = b.i;
        b.g && (c.g = new S(b.g), c.h = b.h);
        Sc(this, c);
        this.o = a.o;
    }
    else
        a && (c = String(a).match(Mc)) ? (this.g = !!b, Oc(this, c[1] || "", !0), this.s = Tc(c[2] || ""), Pc(this, c[3] || "", !0), Qc(this, c[4]), this.l = Tc(c[5] || "", !0), Sc(this, c[6] || "", !0), this.o = Tc(c[7] || "")) : (this.g = !!b, this.h = new Rc(null, this.g)); }
    U.prototype.toString = function () { var a = [], b = this.j; b && a.push(Uc(b, Vc, !0), ":"); var c = this.i; if (c || "file" == b)
        a.push("//"), (b = this.s) && a.push(Uc(b, Vc, !0), "@"), a.push(encodeURIComponent(String(c)).replace(/%25([0-9a-fA-F]{2})/g, "%$1")), c = this.m, null != c && a.push(":", String(c)); if (c = this.l)
        this.i && "/" != c.charAt(0) && a.push("/"), a.push(Uc(c, "/" == c.charAt(0) ? Wc : Xc, !0)); (c = this.h.toString()) && a.push("?", c); (c = this.o) && a.push("#", Uc(c, Yc)); return a.join(""); };
    function N(a) { return new U(a); }
    function Oc(a, b, c) { a.j = c ? Tc(b, !0) : b; a.j && (a.j = a.j.replace(/:$/, "")); }
    function Pc(a, b, c) { a.i = c ? Tc(b, !0) : b; }
    function Qc(a, b) { if (b) {
        b = Number(b);
        if (isNaN(b) || 0 > b)
            throw Error("Bad port number " + b);
        a.m = b;
    }
    else
        a.m = null; }
    function Sc(a, b, c) { b instanceof Rc ? (a.h = b, Zc(a.h, a.g)) : (c || (b = Uc(b, $c)), a.h = new Rc(b, a.g)); }
    function R(a, b, c) { a.h.set(b, c); }
    function jc(a) { R(a, "zx", Math.floor(2147483648 * Math.random()).toString(36) + Math.abs(Math.floor(2147483648 * Math.random()) ^ Date.now()).toString(36)); return a; }
    function ad(a) { return a instanceof U ? N(a) : new U(a, void 0); }
    function bd(a, b, c, d) { var e = new U(null, void 0); a && Oc(e, a); b && Pc(e, b); c && Qc(e, c); d && (e.l = d); return e; }
    function Tc(a, b) { return a ? b ? decodeURI(a.replace(/%25/g, "%2525")) : decodeURIComponent(a) : ""; }
    function Uc(a, b, c) { return "string" === typeof a ? (a = encodeURI(a).replace(b, cd), c && (a = a.replace(/%25([0-9a-fA-F]{2})/g, "%$1")), a) : null; }
    function cd(a) { a = a.charCodeAt(0); return "%" + (a >> 4 & 15).toString(16) + (a & 15).toString(16); }
    var Vc = /[#\/\?@]/g, Xc = /[#\?:]/g, Wc = /[#\?]/g, $c = /[#\?@]/g, Yc = /#/g;
    function Rc(a, b) { this.h = this.g = null; this.i = a || null; this.j = !!b; }
    function V(a) { a.g || (a.g = new S, a.h = 0, a.i && Nc(a.i, function (b, c) { a.add(decodeURIComponent(b.replace(/\+/g, " ")), c); })); }
    k = Rc.prototype;
    k.add = function (a, b) { V(this); this.i = null; a = W(this, a); var c = this.g.get(a); c || this.g.set(a, c = []); c.push(b); this.h += 1; return this; };
    function dd(a, b) { V(a); b = W(a, b); T(a.g.h, b) && (a.i = null, a.h -= a.g.get(b).length, a = a.g, T(a.h, b) && (delete a.h[b], a.i--, a.g.length > 2 * a.i && Lc(a))); }
    function ed(a, b) { V(a); b = W(a, b); return T(a.g.h, b); }
    k.forEach = function (a, b) { V(this); this.g.forEach(function (c, d) { na(c, function (e) { a.call(b, e, d, this); }, this); }, this); };
    k.T = function () { V(this); for (var a = this.g.R(), b = this.g.T(), c = [], d = 0; d < b.length; d++)
        for (var e = a[d], f = 0; f < e.length; f++)
            c.push(b[d]); return c; };
    k.R = function (a) { V(this); var b = []; if ("string" === typeof a)
        ed(this, a) && (b = qa(b, this.g.get(W(this, a))));
    else {
        a = this.g.R();
        for (var c = 0; c < a.length; c++)
            b = qa(b, a[c]);
    } return b; };
    k.set = function (a, b) { V(this); this.i = null; a = W(this, a); ed(this, a) && (this.h -= this.g.get(a).length); this.g.set(a, [b]); this.h += 1; return this; };
    k.get = function (a, b) { if (!a)
        return b; a = this.R(a); return 0 < a.length ? String(a[0]) : b; };
    function mc(a, b, c) { dd(a, b); 0 < c.length && (a.i = null, a.g.set(W(a, b), ra(c)), a.h += c.length); }
    k.toString = function () { if (this.i)
        return this.i; if (!this.g)
        return ""; for (var a = [], b = this.g.T(), c = 0; c < b.length; c++) {
        var d = b[c], e = encodeURIComponent(String(d));
        d = this.R(d);
        for (var f = 0; f < d.length; f++) {
            var h = e;
            "" !== d[f] && (h += "=" + encodeURIComponent(String(d[f])));
            a.push(h);
        }
    } return this.i = a.join("&"); };
    function W(a, b) { b = String(b); a.j && (b = b.toLowerCase()); return b; }
    function Zc(a, b) { b && !a.j && (V(a), a.i = null, a.g.forEach(function (c, d) { var e = d.toLowerCase(); d != e && (dd(this, d), mc(this, e, c)); }, a)); a.j = b; }
    var fd = /** @class */ (function () {
        function fd(a, b) {
            this.h = a;
            this.g = b;
        }
        return fd;
    }());
    function gd(a) { this.l = a || hd; l.PerformanceNavigationTiming ? (a = l.performance.getEntriesByType("navigation"), a = 0 < a.length && ("hq" == a[0].nextHopProtocol || "h2" == a[0].nextHopProtocol)) : a = !!(l.g && l.g.Ea && l.g.Ea() && l.g.Ea().Zb); this.j = a ? this.l : 1; this.g = null; 1 < this.j && (this.g = new Set); this.h = null; this.i = []; }
    var hd = 10;
    function id(a) { return a.h ? !0 : a.g ? a.g.size >= a.j : !1; }
    function Cc(a) { return a.h ? 1 : a.g ? a.g.size : 0; }
    function yc(a, b) { return a.h ? a.h == b : a.g ? a.g.has(b) : !1; }
    function Dc(a, b) { a.g ? a.g.add(b) : a.h = b; }
    function Fc(a, b) { a.h && a.h == b ? a.h = null : a.g && a.g.has(b) && a.g.delete(b); }
    gd.prototype.cancel = function () {
        var e_1, _a;
        this.i = jd(this);
        if (this.h)
            this.h.cancel(), this.h = null;
        else if (this.g && 0 !== this.g.size) {
            try {
                for (var _b = __values$1(this.g.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var a = _c.value;
                    a.cancel();
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            this.g.clear();
        }
    };
    function jd(a) {
        var e_2, _a;
        if (null != a.h)
            return a.i.concat(a.h.D);
        if (null != a.g && 0 !== a.g.size) {
            var b = a.i;
            try {
                for (var _b = __values$1(a.g.values()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var c = _c.value;
                    b = b.concat(c.D);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_2) throw e_2.error; }
            }
            return b;
        }
        return ra(a.i);
    }
    function kd() { }
    kd.prototype.stringify = function (a) { return l.JSON.stringify(a, void 0); };
    kd.prototype.parse = function (a) { return l.JSON.parse(a, void 0); };
    function ld() { this.g = new kd; }
    function md(a, b, c) { var d = c || ""; try {
        Kc(a, function (e, f) { var h = e; p(e) && (h = rb(e)); b.push(d + f + "=" + encodeURIComponent(h)); });
    }
    catch (e) {
        throw b.push(d + "type=" + encodeURIComponent("_badmap")), e;
    } }
    function nd(a, b) { var c = new Mb; if (l.Image) {
        var d_1 = new Image;
        d_1.onload = ja(od, c, d_1, "TestLoadImage: loaded", !0, b);
        d_1.onerror = ja(od, c, d_1, "TestLoadImage: error", !1, b);
        d_1.onabort = ja(od, c, d_1, "TestLoadImage: abort", !1, b);
        d_1.ontimeout = ja(od, c, d_1, "TestLoadImage: timeout", !1, b);
        l.setTimeout(function () { if (d_1.ontimeout)
            d_1.ontimeout(); }, 1E4);
        d_1.src = a;
    }
    else
        b(!1); }
    function od(a, b, c, d, e) { try {
        b.onload = null, b.onerror = null, b.onabort = null, b.ontimeout = null, e(d);
    }
    catch (f) { } }
    function pd(a) { this.l = a.$b || null; this.j = a.ib || !1; }
    t(pd, Yb);
    pd.prototype.g = function () { return new qd(this.l, this.j); };
    pd.prototype.i = function (a) { return function () { return a; }; }({});
    function qd(a, b) { C.call(this); this.D = a; this.u = b; this.m = void 0; this.readyState = rd; this.status = 0; this.responseType = this.responseText = this.response = this.statusText = ""; this.onreadystatechange = null; this.v = new Headers; this.h = null; this.C = "GET"; this.B = ""; this.g = !1; this.A = this.j = this.l = null; }
    t(qd, C);
    var rd = 0;
    k = qd.prototype;
    k.open = function (a, b) { if (this.readyState != rd)
        throw this.abort(), Error("Error reopening a connection"); this.C = a; this.B = b; this.readyState = 1; sd(this); };
    k.send = function (a) { if (1 != this.readyState)
        throw this.abort(), Error("need to call open() first. "); this.g = !0; var b = { headers: this.v, method: this.C, credentials: this.m, cache: void 0 }; a && (b.body = a); (this.D || l).fetch(new Request(this.B, b)).then(this.Va.bind(this), this.ha.bind(this)); };
    k.abort = function () { this.response = this.responseText = ""; this.v = new Headers; this.status = 0; this.j && this.j.cancel("Request was aborted."); 1 <= this.readyState && this.g && 4 != this.readyState && (this.g = !1, td(this)); this.readyState = rd; };
    k.Va = function (a) {
        if (this.g && (this.l = a, this.h || (this.status = this.l.status, this.statusText = this.l.statusText, this.h = a.headers, this.readyState = 2, sd(this)), this.g && (this.readyState = 3, sd(this), this.g)))
            if ("arraybuffer" === this.responseType)
                a.arrayBuffer().then(this.Ta.bind(this), this.ha.bind(this));
            else if ("undefined" !== typeof l.ReadableStream && "body" in a) {
                this.j = a.body.getReader();
                if (this.u) {
                    if (this.responseType)
                        throw Error('responseType must be empty for "streamBinaryChunks" mode responses.');
                    this.response =
                        [];
                }
                else
                    this.response = this.responseText = "", this.A = new TextDecoder;
                ud(this);
            }
            else
                a.text().then(this.Ua.bind(this), this.ha.bind(this));
    };
    function ud(a) { a.j.read().then(a.Sa.bind(a)).catch(a.ha.bind(a)); }
    k.Sa = function (a) { if (this.g) {
        if (this.u && a.value)
            this.response.push(a.value);
        else if (!this.u) {
            var b = a.value ? a.value : new Uint8Array(0);
            if (b = this.A.decode(b, { stream: !a.done }))
                this.response = this.responseText += b;
        }
        a.done ? td(this) : sd(this);
        3 == this.readyState && ud(this);
    } };
    k.Ua = function (a) { this.g && (this.response = this.responseText = a, td(this)); };
    k.Ta = function (a) { this.g && (this.response = a, td(this)); };
    k.ha = function () { this.g && td(this); };
    function td(a) { a.readyState = 4; a.l = null; a.j = null; a.A = null; sd(a); }
    k.setRequestHeader = function (a, b) { this.v.append(a, b); };
    k.getResponseHeader = function (a) { return this.h ? this.h.get(a.toLowerCase()) || "" : ""; };
    k.getAllResponseHeaders = function () { if (!this.h)
        return ""; var a = [], b = this.h.entries(); for (var c = b.next(); !c.done;)
        c = c.value, a.push(c[0] + ": " + c[1]), c = b.next(); return a.join("\r\n"); };
    function sd(a) { a.onreadystatechange && a.onreadystatechange.call(a); }
    Object.defineProperty(qd.prototype, "withCredentials", { get: function () { return "include" === this.m; }, set: function (a) { this.m = a ? "include" : "same-origin"; } });
    var vd = l.JSON.parse;
    function X(a) { C.call(this); this.headers = new S; this.u = a || null; this.h = !1; this.C = this.g = null; this.H = ""; this.m = 0; this.j = ""; this.l = this.F = this.v = this.D = !1; this.B = 0; this.A = null; this.J = wd; this.K = this.L = !1; }
    t(X, C);
    var wd = "", xd = /^https?$/i, yd = ["POST", "PUT"];
    k = X.prototype;
    k.ea = function (a, b, c, d) {
        if (this.g)
            throw Error("[goog.net.XhrIo] Object is active with another request=" + this.H + "; newUri=" + a);
        b = b ? b.toUpperCase() : "GET";
        this.H = a;
        this.j = "";
        this.m = 0;
        this.D = !1;
        this.h = !0;
        this.g = this.u ? this.u.g() : cc.g();
        this.C = this.u ? Zb(this.u) : Zb(cc);
        this.g.onreadystatechange = q(this.Fa, this);
        try {
            this.F = !0, this.g.open(b, String(a), !0), this.F = !1;
        }
        catch (f) {
            zd(this, f);
            return;
        }
        a = c || "";
        var e = new S(this.headers);
        d && Kc(d, function (f, h) { e.set(h, f); });
        d = oa(e.T());
        c = l.FormData && a instanceof l.FormData;
        !(0 <= ma(yd, b)) || d || c || e.set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8");
        e.forEach(function (f, h) { this.g.setRequestHeader(h, f); }, this);
        this.J && (this.g.responseType = this.J);
        "withCredentials" in this.g && this.g.withCredentials !== this.L && (this.g.withCredentials = this.L);
        try {
            Ad(this), 0 < this.B && ((this.K = Bd(this.g)) ? (this.g.timeout = this.B, this.g.ontimeout = q(this.pa, this)) : this.A = Gb(this.pa, this.B, this)), this.v = !0, this.g.send(a), this.v = !1;
        }
        catch (f) {
            zd(this, f);
        }
    };
    function Bd(a) { return y && Ra() && "number" === typeof a.timeout && void 0 !== a.ontimeout; }
    function pa(a) { return "content-type" == a.toLowerCase(); }
    k.pa = function () { "undefined" != typeof goog && this.g && (this.j = "Timed out after " + this.B + "ms, aborting", this.m = 8, D(this, "timeout"), this.abort(8)); };
    function zd(a, b) { a.h = !1; a.g && (a.l = !0, a.g.abort(), a.l = !1); a.j = b; a.m = 5; Cd(a); Dd(a); }
    function Cd(a) { a.D || (a.D = !0, D(a, "complete"), D(a, "error")); }
    k.abort = function (a) { this.g && this.h && (this.h = !1, this.l = !0, this.g.abort(), this.l = !1, this.m = a || 7, D(this, "complete"), D(this, "abort"), Dd(this)); };
    k.M = function () { this.g && (this.h && (this.h = !1, this.l = !0, this.g.abort(), this.l = !1), Dd(this, !0)); X.Z.M.call(this); };
    k.Fa = function () { this.s || (this.F || this.v || this.l ? Ed(this) : this.cb()); };
    k.cb = function () { Ed(this); };
    function Ed(a) {
        if (a.h && "undefined" != typeof goog && (!a.C[1] || 4 != O(a) || 2 != a.ba()))
            if (a.v && 4 == O(a))
                Gb(a.Fa, 0, a);
            else if (D(a, "readystatechange"), 4 == O(a)) {
                a.h = !1;
                try {
                    var n = a.ba();
                    a: switch (n) {
                        case 200:
                        case 201:
                        case 202:
                        case 204:
                        case 206:
                        case 304:
                        case 1223:
                            var b = !0;
                            break a;
                        default: b = !1;
                    }
                    var c;
                    if (!(c = b)) {
                        var d;
                        if (d = 0 === n) {
                            var e = String(a.H).match(Mc)[1] || null;
                            if (!e && l.self && l.self.location) {
                                var f = l.self.location.protocol;
                                e = f.substr(0, f.length - 1);
                            }
                            d = !xd.test(e ? e.toLowerCase() : "");
                        }
                        c = d;
                    }
                    if (c)
                        D(a, "complete"), D(a, "success");
                    else {
                        a.m = 6;
                        try {
                            var h = 2 < O(a) ? a.g.statusText : "";
                        }
                        catch (u) {
                            h = "";
                        }
                        a.j = h + " [" + a.ba() + "]";
                        Cd(a);
                    }
                }
                finally {
                    Dd(a);
                }
            }
    }
    function Dd(a, b) { if (a.g) {
        Ad(a);
        var c = a.g, d = a.C[0] ? aa : null;
        a.g = null;
        a.C = null;
        b || D(a, "ready");
        try {
            c.onreadystatechange = d;
        }
        catch (e) { }
    } }
    function Ad(a) { a.g && a.K && (a.g.ontimeout = null); a.A && (l.clearTimeout(a.A), a.A = null); }
    function O(a) { return a.g ? a.g.readyState : 0; }
    k.ba = function () { try {
        return 2 < O(this) ? this.g.status : -1;
    }
    catch (a) {
        return -1;
    } };
    k.ga = function () { try {
        return this.g ? this.g.responseText : "";
    }
    catch (a) {
        return "";
    } };
    k.Qa = function (a) { if (this.g) {
        var b = this.g.responseText;
        a && 0 == b.indexOf(a) && (b = b.substring(a.length));
        return vd(b);
    } };
    function oc(a) { try {
        if (!a.g)
            return null;
        if ("response" in a.g)
            return a.g.response;
        switch (a.J) {
            case wd:
            case "text": return a.g.responseText;
            case "arraybuffer": if ("mozResponseArrayBuffer" in a.g)
                return a.g.mozResponseArrayBuffer;
        }
        return null;
    }
    catch (b) {
        return null;
    } }
    k.Da = function () { return this.m; };
    k.La = function () { return "string" === typeof this.j ? this.j : String(this.j); };
    function Fd(a) { var b = ""; xa(a, function (c, d) { b += d; b += ":"; b += c; b += "\r\n"; }); return b; }
    function Gd(a, b, c) { a: {
        for (d in c) {
            var d = !1;
            break a;
        }
        d = !0;
    } d || (c = Fd(c), "string" === typeof a ? (null != c && encodeURIComponent(String(c))) : R(a, b, c)); }
    function Hd(a, b, c) { return c && c.internalChannelParams ? c.internalChannelParams[a] || b : b; }
    function Id(a) {
        this.za = 0;
        this.l = [];
        this.h = new Mb;
        this.la = this.oa = this.F = this.W = this.g = this.sa = this.D = this.aa = this.o = this.P = this.s = null;
        this.Za = this.V = 0;
        this.Xa = Hd("failFast", !1, a);
        this.N = this.v = this.u = this.m = this.j = null;
        this.X = !0;
        this.I = this.ta = this.U = -1;
        this.Y = this.A = this.C = 0;
        this.Pa = Hd("baseRetryDelayMs", 5E3, a);
        this.$a = Hd("retryDelaySeedMs", 1E4, a);
        this.Ya = Hd("forwardChannelMaxRetries", 2, a);
        this.ra = Hd("forwardChannelRequestTimeoutMs", 2E4, a);
        this.qa = a && a.xmlHttpFactory || void 0;
        this.Ba = a && a.Yb || !1;
        this.K = void 0;
        this.H = a && a.supportsCrossDomainXhr || !1;
        this.J = "";
        this.i = new gd(a && a.concurrentRequestLimit);
        this.Ca = new ld;
        this.ja = a && a.fastHandshake || !1;
        this.Ra = a && a.Wb || !1;
        a && a.Aa && this.h.Aa();
        a && a.forceLongPolling && (this.X = !1);
        this.$ = !this.ja && this.X && a && a.detectBufferingProxy || !1;
        this.ka = void 0;
        this.O = 0;
        this.L = !1;
        this.B = null;
        this.Wa = !a || !1 !== a.Xb;
    }
    k = Id.prototype;
    k.ma = 8;
    k.G = 1;
    function Ic(a) { Jd(a); if (3 == a.G) {
        var b = a.V++, c = N(a.F);
        R(c, "SID", a.J);
        R(c, "RID", b);
        R(c, "TYPE", "terminate");
        Kd(a, c);
        b = new M(a, a.h, b, void 0);
        b.K = 2;
        b.v = jc(N(c));
        c = !1;
        l.navigator && l.navigator.sendBeacon && (c = l.navigator.sendBeacon(b.v.toString(), ""));
        !c && l.Image && ((new Image).src = b.v, c = !0);
        c || (b.g = nc(b.l, null), b.g.ea(b.v));
        b.F = Date.now();
        lc(b);
    } Ld(a); }
    k.hb = function (a) { try {
        this.h.info("Origin Trials invoked: " + a);
    }
    catch (b) { } };
    function Ac(a) { a.g && (wc(a), a.g.cancel(), a.g = null); }
    function Jd(a) { Ac(a); a.u && (l.clearTimeout(a.u), a.u = null); zc(a); a.i.cancel(); a.m && ("number" === typeof a.m && l.clearTimeout(a.m), a.m = null); }
    function Md(a, b) { a.l.push(new fd(a.Za++, b)); 3 == a.G && Hc(a); }
    function Hc(a) { id(a.i) || a.m || (a.m = !0, zb(a.Ha, a), a.C = 0); }
    function Nd(a, b) { if (Cc(a.i) >= a.i.j - (a.m ? 1 : 0))
        return !1; if (a.m)
        return a.l = b.D.concat(a.l), !0; if (1 == a.G || 2 == a.G || a.C >= (a.Xa ? 0 : a.Ya))
        return !1; a.m = K(q(a.Ha, a, b), Od(a, a.C)); a.C++; return !0; }
    k.Ha = function (a) {
        if (this.m)
            if (this.m = null, 1 == this.G) {
                if (!a) {
                    this.V = Math.floor(1E5 * Math.random());
                    a = this.V++;
                    var e = new M(this, this.h, a, void 0);
                    var f = this.s;
                    this.P && (f ? (f = ya(f), Aa(f, this.P)) : f = this.P);
                    null === this.o && (e.H = f);
                    if (this.ja)
                        a: {
                            var b = 0;
                            for (var c = 0; c < this.l.length; c++) {
                                b: {
                                    var d = this.l[c];
                                    if ("__data__" in d.g && (d = d.g.__data__, "string" === typeof d)) {
                                        d = d.length;
                                        break b;
                                    }
                                    d = void 0;
                                }
                                if (void 0 === d)
                                    break;
                                b += d;
                                if (4096 < b) {
                                    b = c;
                                    break a;
                                }
                                if (4096 === b || c === this.l.length - 1) {
                                    b = c + 1;
                                    break a;
                                }
                            }
                            b = 1E3;
                        }
                    else
                        b = 1E3;
                    b =
                        Pd(this, e, b);
                    c = N(this.F);
                    R(c, "RID", a);
                    R(c, "CVER", 22);
                    this.D && R(c, "X-HTTP-Session-Id", this.D);
                    Kd(this, c);
                    this.o && f && Gd(c, this.o, f);
                    Dc(this.i, e);
                    this.Ra && R(c, "TYPE", "init");
                    this.ja ? (R(c, "$req", b), R(c, "SID", "null"), e.$ = !0, ic(e, c, null)) : ic(e, c, b);
                    this.G = 2;
                }
            }
            else
                3 == this.G && (a ? Qd(this, a) : 0 == this.l.length || id(this.i) || Qd(this));
    };
    function Qd(a, b) { var c; b ? c = b.m : c = a.V++; var d = N(a.F); R(d, "SID", a.J); R(d, "RID", c); R(d, "AID", a.U); Kd(a, d); a.o && a.s && Gd(d, a.o, a.s); c = new M(a, a.h, c, a.C + 1); null === a.o && (c.H = a.s); b && (a.l = b.D.concat(a.l)); b = Pd(a, c, 1E3); c.setTimeout(Math.round(.5 * a.ra) + Math.round(.5 * a.ra * Math.random())); Dc(a.i, c); ic(c, d, b); }
    function Kd(a, b) { a.j && Kc({}, function (c, d) { R(b, d, c); }); }
    function Pd(a, b, c) { c = Math.min(a.l.length, c); var d = a.j ? q(a.j.Oa, a.j, a) : null; a: {
        var e = a.l;
        var f = -1;
        for (;;) {
            var h = ["count=" + c];
            -1 == f ? 0 < c ? (f = e[0].h, h.push("ofs=" + f)) : f = 0 : h.push("ofs=" + f);
            var n = !0;
            for (var u = 0; u < c; u++) {
                var m = e[u].h;
                var r = e[u].g;
                m -= f;
                if (0 > m)
                    f = Math.max(0, e[u].h - 100), n = !1;
                else
                    try {
                        md(r, h, "req" + m + "_");
                    }
                    catch (G) {
                        d && d(r);
                    }
            }
            if (n) {
                d = h.join("&");
                break a;
            }
        }
    } a = a.l.splice(0, c); b.D = a; return d; }
    function Gc(a) { a.g || a.u || (a.Y = 1, zb(a.Ga, a), a.A = 0); }
    function Bc(a) { if (a.g || a.u || 3 <= a.A)
        return !1; a.Y++; a.u = K(q(a.Ga, a), Od(a, a.A)); a.A++; return !0; }
    k.Ga = function () { this.u = null; Rd(this); if (this.$ && !(this.L || null == this.g || 0 >= this.O)) {
        var a = 2 * this.O;
        this.h.info("BP detection timer enabled: " + a);
        this.B = K(q(this.bb, this), a);
    } };
    k.bb = function () { this.B && (this.B = null, this.h.info("BP detection timeout reached."), this.h.info("Buffering proxy detected and switch to long-polling!"), this.N = !1, this.L = !0, J(10), Ac(this), Rd(this)); };
    function wc(a) { null != a.B && (l.clearTimeout(a.B), a.B = null); }
    function Rd(a) { a.g = new M(a, a.h, "rpc", a.Y); null === a.o && (a.g.H = a.s); a.g.O = 0; var b = N(a.oa); R(b, "RID", "rpc"); R(b, "SID", a.J); R(b, "CI", a.N ? "0" : "1"); R(b, "AID", a.U); Kd(a, b); R(b, "TYPE", "xmlhttp"); a.o && a.s && Gd(b, a.o, a.s); a.K && a.g.setTimeout(a.K); var c = a.g; a = a.la; c.K = 1; c.v = jc(N(b)); c.s = null; c.U = !0; kc(c, a); }
    k.ab = function () { null != this.v && (this.v = null, Ac(this), Bc(this), J(19)); };
    function zc(a) { null != a.v && (l.clearTimeout(a.v), a.v = null); }
    function uc(a, b) { var c = null; if (a.g == b) {
        zc(a);
        wc(a);
        a.g = null;
        var d = 2;
    }
    else if (yc(a.i, b))
        c = b.D, Fc(a.i, b), d = 1;
    else
        return; a.I = b.N; if (0 != a.G)
        if (b.i)
            if (1 == d) {
                c = b.s ? b.s.length : 0;
                b = Date.now() - b.F;
                var e = a.C;
                d = Sb();
                D(d, new Vb(d, c, b, e));
                Hc(a);
            }
            else
                Gc(a);
        else if (e = b.o, 3 == e || 0 == e && 0 < a.I || !(1 == d && Nd(a, b) || 2 == d && Bc(a)))
            switch (c && 0 < c.length && (b = a.i, b.i = b.i.concat(c)), e) {
                case 1:
                    Q(a, 5);
                    break;
                case 4:
                    Q(a, 10);
                    break;
                case 3:
                    Q(a, 6);
                    break;
                default: Q(a, 2);
            } }
    function Od(a, b) { var c = a.Pa + Math.floor(Math.random() * a.$a); a.j || (c *= 2); return c * b; }
    function Q(a, b) { a.h.info("Error code " + b); if (2 == b) {
        var c = null;
        a.j && (c = null);
        var d = q(a.jb, a);
        c || (c = new U("//www.google.com/images/cleardot.gif"), l.location && "http" == l.location.protocol || Oc(c, "https"), jc(c));
        nd(c.toString(), d);
    }
    else
        J(2); a.G = 0; a.j && a.j.va(b); Ld(a); Jd(a); }
    k.jb = function (a) { a ? (this.h.info("Successfully pinged google.com"), J(2)) : (this.h.info("Failed to ping google.com"), J(1)); };
    function Ld(a) { a.G = 0; a.I = -1; if (a.j) {
        if (0 != jd(a.i).length || 0 != a.l.length)
            a.i.i.length = 0, ra(a.l), a.l.length = 0;
        a.j.ua();
    } }
    function Ec(a, b, c) { var d = ad(c); if ("" != d.i)
        b && Pc(d, b + "." + d.i), Qc(d, d.m);
    else {
        var e = l.location;
        d = bd(e.protocol, b ? b + "." + e.hostname : e.hostname, +e.port, c);
    } a.aa && xa(a.aa, function (e, f) { R(d, f, e); }); b = a.D; c = a.sa; b && c && R(d, b, c); R(d, "VER", a.ma); Kd(a, d); return d; }
    function nc(a, b, c) { if (b && !a.H)
        throw Error("Can't create secondary domain capable XhrIo object."); b = c && a.Ba && !a.qa ? new X(new pd({ ib: !0 })) : new X(a.qa); b.L = a.H; return b; }
    function Sd() { }
    k = Sd.prototype;
    k.xa = function () { };
    k.wa = function () { };
    k.va = function () { };
    k.ua = function () { };
    k.Oa = function () { };
    function Td() { if (y && !(10 <= Number(Ua)))
        throw Error("Environmental error: no available transport."); }
    Td.prototype.g = function (a, b) { return new Y(a, b); };
    function Y(a, b) {
        C.call(this);
        this.g = new Id(b);
        this.l = a;
        this.h = b && b.messageUrlParams || null;
        a = b && b.messageHeaders || null;
        b && b.clientProtocolHeaderRequired && (a ? a["X-Client-Protocol"] = "webchannel" : a = { "X-Client-Protocol": "webchannel" });
        this.g.s = a;
        a = b && b.initMessageHeaders || null;
        b && b.messageContentType && (a ? a["X-WebChannel-Content-Type"] = b.messageContentType : a = { "X-WebChannel-Content-Type": b.messageContentType });
        b && b.ya && (a ? a["X-WebChannel-Client-Profile"] = b.ya : a = { "X-WebChannel-Client-Profile": b.ya });
        this.g.P =
            a;
        (a = b && b.httpHeadersOverwriteParam) && !sa(a) && (this.g.o = a);
        this.A = b && b.supportsCrossDomainXhr || !1;
        this.v = b && b.sendRawJson || !1;
        (b = b && b.httpSessionIdParam) && !sa(b) && (this.g.D = b, a = this.h, null !== a && b in a && (a = this.h, b in a && delete a[b]));
        this.j = new Z(this);
    }
    t(Y, C);
    Y.prototype.m = function () { this.g.j = this.j; this.A && (this.g.H = !0); var a = this.g, b = this.l, c = this.h || void 0; a.Wa && (a.h.info("Origin Trials enabled."), zb(q(a.hb, a, b))); J(0); a.W = b; a.aa = c || {}; a.N = a.X; a.F = Ec(a, null, a.W); Hc(a); };
    Y.prototype.close = function () { Ic(this.g); };
    Y.prototype.u = function (a) { if ("string" === typeof a) {
        var b = {};
        b.__data__ = a;
        Md(this.g, b);
    }
    else
        this.v ? (b = {}, b.__data__ = rb(a), Md(this.g, b)) : Md(this.g, a); };
    Y.prototype.M = function () { this.g.j = null; delete this.j; Ic(this.g); delete this.g; Y.Z.M.call(this); };
    function Ud(a) { ac.call(this); var b = a.__sm__; if (b) {
        a: {
            for (var c in b) {
                a = c;
                break a;
            }
            a = void 0;
        }
        if (this.i = a)
            a = this.i, b = null !== b && a in b ? b[a] : void 0;
        this.data = b;
    }
    else
        this.data = a; }
    t(Ud, ac);
    function Vd() { bc.call(this); this.status = 1; }
    t(Vd, bc);
    function Z(a) { this.g = a; }
    t(Z, Sd);
    Z.prototype.xa = function () { D(this.g, "a"); };
    Z.prototype.wa = function (a) { D(this.g, new Ud(a)); };
    Z.prototype.va = function (a) { D(this.g, new Vd(a)); };
    Z.prototype.ua = function () { D(this.g, "b"); }; /*

     Copyright 2017 Google LLC

     Licensed under the Apache License, Version 2.0 (the "License");
     you may not use this file except in compliance with the License.
     You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

     Unless required by applicable law or agreed to in writing, software
     distributed under the License is distributed on an "AS IS" BASIS,
     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     See the License for the specific language governing permissions and
     limitations under the License.
    */
    Td.prototype.createWebChannel = Td.prototype.g;
    Y.prototype.send = Y.prototype.u;
    Y.prototype.open = Y.prototype.m;
    Y.prototype.close = Y.prototype.close;
    Wb.NO_ERROR = 0;
    Wb.TIMEOUT = 8;
    Wb.HTTP_ERROR = 6;
    Xb.COMPLETE = "complete";
    $b.EventType = L;
    L.OPEN = "a";
    L.CLOSE = "b";
    L.ERROR = "c";
    L.MESSAGE = "d";
    C.prototype.listen = C.prototype.N;
    X.prototype.listenOnce = X.prototype.O;
    X.prototype.getLastError = X.prototype.La;
    X.prototype.getLastErrorCode = X.prototype.Da;
    X.prototype.getStatus = X.prototype.ba;
    X.prototype.getResponseJson = X.prototype.Qa;
    X.prototype.getResponseText = X.prototype.ga;
    X.prototype.send = X.prototype.ea;
    var createWebChannelTransport = function () { return new Td; };
    var getStatEventTarget = function () { return Sb(); };
    var ErrorCode = Wb;
    var EventType = Xb;
    var Event = H;
    var Stat = { rb: 0, ub: 1, vb: 2, Ob: 3, Tb: 4, Qb: 5, Rb: 6, Pb: 7, Nb: 8, Sb: 9, PROXY: 10, NOPROXY: 11, Lb: 12, Hb: 13, Ib: 14, Gb: 15, Jb: 16, Kb: 17, nb: 18, mb: 19, ob: 20 };
    var FetchXmlHttpFactory = pd;
    var WebChannel = $b;
    var XhrIo = X;

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Simple wrapper around a nullable UID. Mostly exists to make code more
     * readable.
     */
    class S$1 {
        constructor(t) {
            this.uid = t;
        }
        isAuthenticated() {
            return null != this.uid;
        }
        /**
         * Returns a key representing this user, suitable for inclusion in a
         * dictionary.
         */    toKey() {
            return this.isAuthenticated() ? "uid:" + this.uid : "anonymous-user";
        }
        isEqual(t) {
            return t.uid === this.uid;
        }
    }

    /** A user with a null UID. */ S$1.UNAUTHENTICATED = new S$1(null), 
    // TODO(mikelehen): Look into getting a proper uid-equivalent for
    // non-FirebaseAuth providers.
    S$1.GOOGLE_CREDENTIALS = new S$1("google-credentials-uid"), S$1.FIRST_PARTY = new S$1("first-party-uid"), 
    S$1.MOCK_USER = new S$1("mock-user");

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    let D$1 = "9.0.1";

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    const C$1 = new Logger("@firebase/firestore");

    // Helper methods are needed because variables can't be exported as read/write
    function N$1() {
        return C$1.logLevel;
    }

    function k$1(t, ...e) {
        if (C$1.logLevel <= LogLevel.DEBUG) {
            const n = e.map(F$1);
            C$1.debug(`Firestore (${D$1}): ${t}`, ...n);
        }
    }

    function $(t, ...e) {
        if (C$1.logLevel <= LogLevel.ERROR) {
            const n = e.map(F$1);
            C$1.error(`Firestore (${D$1}): ${t}`, ...n);
        }
    }

    /**
     * @internal
     */ function O$1(t, ...e) {
        if (C$1.logLevel <= LogLevel.WARN) {
            const n = e.map(F$1);
            C$1.warn(`Firestore (${D$1}): ${t}`, ...n);
        }
    }

    /**
     * Converts an additional log parameter to a string representation.
     */ function F$1(t) {
        if ("string" == typeof t) return t;
        try {
            return e = t, JSON.stringify(e);
        } catch (e) {
            // Converting to JSON failed, just log the object directly
            return t;
        }
        /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
        /** Formats an object as a JSON string, suitable for logging. */
        var e;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Unconditionally fails, throwing an Error with the given message.
     * Messages are stripped in production builds.
     *
     * Returns `never` and can be used in expressions:
     * @example
     * let futureVar = fail('not implemented yet');
     */ function M$1(t = "Unexpected state") {
        // Log the failure in addition to throw an exception, just in case the
        // exception is swallowed.
        const e = `FIRESTORE (${D$1}) INTERNAL ASSERTION FAILED: ` + t;
        // NOTE: We don't use FirestoreError here because these are internal failures
        // that cannot be handled by the user. (Also it would create a circular
        // dependency between the error and assert modules which doesn't work.)
        throw $(e), new Error(e);
    }

    /**
     * Fails if the given assertion condition is false, throwing an Error with the
     * given message if it did.
     *
     * Messages are stripped in production builds.
     */ function L$1(t, e) {
        t || M$1();
    }

    /**
     * Casts `obj` to `T`. In non-production builds, verifies that `obj` is an
     * instance of `T` before casting.
     */ function U$1(t, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e) {
        return t;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ const q$1 = {
        // Causes are copied from:
        // https://github.com/grpc/grpc/blob/bceec94ea4fc5f0085d81235d8e1c06798dc341a/include/grpc%2B%2B/impl/codegen/status_code_enum.h
        /** Not an error; returned on success. */
        OK: "ok",
        /** The operation was cancelled (typically by the caller). */
        CANCELLED: "cancelled",
        /** Unknown error or an error from a different error domain. */
        UNKNOWN: "unknown",
        /**
         * Client specified an invalid argument. Note that this differs from
         * FAILED_PRECONDITION. INVALID_ARGUMENT indicates arguments that are
         * problematic regardless of the state of the system (e.g., a malformed file
         * name).
         */
        INVALID_ARGUMENT: "invalid-argument",
        /**
         * Deadline expired before operation could complete. For operations that
         * change the state of the system, this error may be returned even if the
         * operation has completed successfully. For example, a successful response
         * from a server could have been delayed long enough for the deadline to
         * expire.
         */
        DEADLINE_EXCEEDED: "deadline-exceeded",
        /** Some requested entity (e.g., file or directory) was not found. */
        NOT_FOUND: "not-found",
        /**
         * Some entity that we attempted to create (e.g., file or directory) already
         * exists.
         */
        ALREADY_EXISTS: "already-exists",
        /**
         * The caller does not have permission to execute the specified operation.
         * PERMISSION_DENIED must not be used for rejections caused by exhausting
         * some resource (use RESOURCE_EXHAUSTED instead for those errors).
         * PERMISSION_DENIED must not be used if the caller can not be identified
         * (use UNAUTHENTICATED instead for those errors).
         */
        PERMISSION_DENIED: "permission-denied",
        /**
         * The request does not have valid authentication credentials for the
         * operation.
         */
        UNAUTHENTICATED: "unauthenticated",
        /**
         * Some resource has been exhausted, perhaps a per-user quota, or perhaps the
         * entire file system is out of space.
         */
        RESOURCE_EXHAUSTED: "resource-exhausted",
        /**
         * Operation was rejected because the system is not in a state required for
         * the operation's execution. For example, directory to be deleted may be
         * non-empty, an rmdir operation is applied to a non-directory, etc.
         *
         * A litmus test that may help a service implementor in deciding
         * between FAILED_PRECONDITION, ABORTED, and UNAVAILABLE:
         *  (a) Use UNAVAILABLE if the client can retry just the failing call.
         *  (b) Use ABORTED if the client should retry at a higher-level
         *      (e.g., restarting a read-modify-write sequence).
         *  (c) Use FAILED_PRECONDITION if the client should not retry until
         *      the system state has been explicitly fixed. E.g., if an "rmdir"
         *      fails because the directory is non-empty, FAILED_PRECONDITION
         *      should be returned since the client should not retry unless
         *      they have first fixed up the directory by deleting files from it.
         *  (d) Use FAILED_PRECONDITION if the client performs conditional
         *      REST Get/Update/Delete on a resource and the resource on the
         *      server does not match the condition. E.g., conflicting
         *      read-modify-write on the same resource.
         */
        FAILED_PRECONDITION: "failed-precondition",
        /**
         * The operation was aborted, typically due to a concurrency issue like
         * sequencer check failures, transaction aborts, etc.
         *
         * See litmus test above for deciding between FAILED_PRECONDITION, ABORTED,
         * and UNAVAILABLE.
         */
        ABORTED: "aborted",
        /**
         * Operation was attempted past the valid range. E.g., seeking or reading
         * past end of file.
         *
         * Unlike INVALID_ARGUMENT, this error indicates a problem that may be fixed
         * if the system state changes. For example, a 32-bit file system will
         * generate INVALID_ARGUMENT if asked to read at an offset that is not in the
         * range [0,2^32-1], but it will generate OUT_OF_RANGE if asked to read from
         * an offset past the current file size.
         *
         * There is a fair bit of overlap between FAILED_PRECONDITION and
         * OUT_OF_RANGE. We recommend using OUT_OF_RANGE (the more specific error)
         * when it applies so that callers who are iterating through a space can
         * easily look for an OUT_OF_RANGE error to detect when they are done.
         */
        OUT_OF_RANGE: "out-of-range",
        /** Operation is not implemented or not supported/enabled in this service. */
        UNIMPLEMENTED: "unimplemented",
        /**
         * Internal errors. Means some invariants expected by underlying System has
         * been broken. If you see one of these errors, Something is very broken.
         */
        INTERNAL: "internal",
        /**
         * The service is currently unavailable. This is a most likely a transient
         * condition and may be corrected by retrying with a backoff.
         *
         * See litmus test above for deciding between FAILED_PRECONDITION, ABORTED,
         * and UNAVAILABLE.
         */
        UNAVAILABLE: "unavailable",
        /** Unrecoverable data loss or corruption. */
        DATA_LOSS: "data-loss"
    };

    /** An error returned by a Firestore operation. */ class K$1 extends Error {
        /** @hideconstructor */
        constructor(
        /**
         * The backend error code associated with this error.
         */
        t, 
        /**
         * A custom error description.
         */
        e) {
            super(e), this.code = t, this.message = e, 
            /** The custom name for all FirestoreErrors. */
            this.name = "FirebaseError", 
            // HACK: We write a toString property directly because Error is not a real
            // class and so inheritance does not work correctly. We could alternatively
            // do the same "back-door inheritance" trick that FirebaseError does.
            this.toString = () => `${this.name}: [code=${this.code}]: ${this.message}`;
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class j {
        constructor() {
            this.promise = new Promise(((t, e) => {
                this.resolve = t, this.reject = e;
            }));
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class Q$1 {
        constructor(t, e) {
            this.user = e, this.type = "OAuth", this.authHeaders = {}, 
            // Set the headers using Object Literal notation to avoid minification
            this.authHeaders.Authorization = `Bearer ${t}`;
        }
    }

    /** A CredentialsProvider that always yields an empty token. */ class W$1 {
        getToken() {
            return Promise.resolve(null);
        }
        invalidateToken() {}
        start(t, e) {
            // Fire with initial user.
            t.enqueueRetryable((() => e(S$1.UNAUTHENTICATED)));
        }
        shutdown() {}
    }

    class z$1 {
        constructor(t) {
            this.t = t, 
            /** Tracks the current User. */
            this.currentUser = S$1.UNAUTHENTICATED, 
            /**
             * Counter used to detect if the token changed while a getToken request was
             * outstanding.
             */
            this.i = 0, this.forceRefresh = !1, this.auth = null;
        }
        start(t, e) {
            let n = this.i;
            // A change listener that prevents double-firing for the same token change.
                    const s = t => this.i !== n ? (n = this.i, e(t)) : Promise.resolve();
            // A promise that can be waited on to block on the next token change.
            // This promise is re-created after each change.
                    let i = new j;
            this.o = () => {
                this.i++, this.currentUser = this.u(), i.resolve(), i = new j, t.enqueueRetryable((() => s(this.currentUser)));
            };
            const r = e => {
                t.enqueueRetryable((async () => {
                    k$1("FirebaseCredentialsProvider", "Auth detected"), this.auth = e, this.auth.addAuthTokenListener(this.o), 
                    // Call the change listener inline to block on the user change.
                    await i.promise, await s(this.currentUser);
                }));
            };
            this.t.onInit((t => r(t))), 
            // Our users can initialize Auth right after Firestore, so we give it
            // a chance to register itself with the component framework before we
            // determine whether to start up in unauthenticated mode.
            setTimeout((() => {
                if (!this.auth) {
                    const t = this.t.getImmediate({
                        optional: !0
                    });
                    t ? r(t) : (
                    // If auth is still not available, proceed with `null` user
                    k$1("FirebaseCredentialsProvider", "Auth not yet detected"), i.resolve(), i = new j);
                }
            }), 0), t.enqueueRetryable((async () => {
                // If we have not received a token, wait for the first one.
                0 === this.i && (await i.promise, await s(this.currentUser));
            }));
        }
        getToken() {
            // Take note of the current value of the tokenCounter so that this method
            // can fail (with an ABORTED error) if there is a token change while the
            // request is outstanding.
            const t = this.i, e = this.forceRefresh;
            return this.forceRefresh = !1, this.auth ? this.auth.getToken(e).then((e => 
            // Cancel the request since the token changed while the request was
            // outstanding so the response is potentially for a previous user (which
            // user, we can't be sure).
            this.i !== t ? (k$1("FirebaseCredentialsProvider", "getToken aborted due to token change."), 
            this.getToken()) : e ? (L$1("string" == typeof e.accessToken), new Q$1(e.accessToken, this.currentUser)) : null)) : Promise.resolve(null);
        }
        invalidateToken() {
            this.forceRefresh = !0;
        }
        shutdown() {
            this.auth && this.auth.removeAuthTokenListener(this.o);
        }
        // Auth.getUid() can return null even with a user logged in. It is because
        // getUid() is synchronous, but the auth code populating Uid is asynchronous.
        // This method should only be called in the AuthTokenListener callback
        // to guarantee to get the actual user.
        u() {
            const t = this.auth && this.auth.getUid();
            return L$1(null === t || "string" == typeof t), new S$1(t);
        }
    }

    /*
     * FirstPartyToken provides a fresh token each time its value
     * is requested, because if the token is too old, requests will be rejected.
     * Technically this may no longer be necessary since the SDK should gracefully
     * recover from unauthenticated errors (see b/33147818 for context), but it's
     * safer to keep the implementation as-is.
     */ class H$1 {
        constructor(t, e, n) {
            this.h = t, this.l = e, this.m = n, this.type = "FirstParty", this.user = S$1.FIRST_PARTY;
        }
        get authHeaders() {
            const t = {
                "X-Goog-AuthUser": this.l
            }, e = this.h.auth.getAuthHeaderValueForFirstParty([]);
            // Use array notation to prevent minification
                    return e && (t.Authorization = e), this.m && (t["X-Goog-Iam-Authorization-Token"] = this.m), 
            t;
        }
    }

    /*
     * Provides user credentials required for the Firestore JavaScript SDK
     * to authenticate the user, using technique that is only available
     * to applications hosted by Google.
     */ class J$1 {
        constructor(t, e, n) {
            this.h = t, this.l = e, this.m = n;
        }
        getToken() {
            return Promise.resolve(new H$1(this.h, this.l, this.m));
        }
        start(t, e) {
            // Fire with initial uid.
            t.enqueueRetryable((() => e(S$1.FIRST_PARTY)));
        }
        shutdown() {}
        invalidateToken() {}
    }

    /**
     * Builds a CredentialsProvider depending on the type of
     * the credentials passed in.
     */
    /**
     * @license
     * Copyright 2018 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * `ListenSequence` is a monotonic sequence. It is initialized with a minimum value to
     * exceed. All subsequent calls to next will return increasing values. If provided with a
     * `SequenceNumberSyncer`, it will additionally bump its next value when told of a new value, as
     * well as write out sequence numbers that it produces via `next()`.
     */
    class Y$1 {
        constructor(t, e) {
            this.previousValue = t, e && (e.sequenceNumberHandler = t => this.g(t), this.p = t => e.writeSequenceNumber(t));
        }
        g(t) {
            return this.previousValue = Math.max(t, this.previousValue), this.previousValue;
        }
        next() {
            const t = ++this.previousValue;
            return this.p && this.p(t), t;
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Generates `nBytes` of random bytes.
     *
     * If `nBytes < 0` , an error will be thrown.
     */
    function X$1(t) {
        // Polyfills for IE and WebWorker by using `self` and `msCrypto` when `crypto` is not available.
        const e = 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "undefined" != typeof self && (self.crypto || self.msCrypto), n = new Uint8Array(t);
        if (e && "function" == typeof e.getRandomValues) e.getRandomValues(n); else 
        // Falls back to Math.random
        for (let e = 0; e < t; e++) n[e] = Math.floor(256 * Math.random());
        return n;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ Y$1.T = -1;

    class Z$1 {
        static I() {
            // Alphanumeric characters
            const t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", e = Math.floor(256 / t.length) * t.length;
            // The largest byte value that is a multiple of `char.length`.
                    let n = "";
            for (;n.length < 20; ) {
                const s = X$1(40);
                for (let i = 0; i < s.length; ++i) 
                // Only accept values that are [0, maxMultiple), this ensures they can
                // be evenly mapped to indices of `chars` via a modulo operation.
                n.length < 20 && s[i] < e && (n += t.charAt(s[i] % t.length));
            }
            return n;
        }
    }

    function tt(t, e) {
        return t < e ? -1 : t > e ? 1 : 0;
    }

    /** Helper to compare arrays using isEqual(). */ function et(t, e, n) {
        return t.length === e.length && t.every(((t, s) => n(t, e[s])));
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    // The earliest date supported by Firestore timestamps (0001-01-01T00:00:00Z).
    /**
     * A `Timestamp` represents a point in time independent of any time zone or
     * calendar, represented as seconds and fractions of seconds at nanosecond
     * resolution in UTC Epoch time.
     *
     * It is encoded using the Proleptic Gregorian Calendar which extends the
     * Gregorian calendar backwards to year one. It is encoded assuming all minutes
     * are 60 seconds long, i.e. leap seconds are "smeared" so that no leap second
     * table is needed for interpretation. Range is from 0001-01-01T00:00:00Z to
     * 9999-12-31T23:59:59.999999999Z.
     *
     * For examples and further specifications, refer to the
     * {@link https://github.com/google/protobuf/blob/master/src/google/protobuf/timestamp.proto | Timestamp definition}.
     */
    class st {
        /**
         * Creates a new timestamp.
         *
         * @param seconds - The number of seconds of UTC time since Unix epoch
         *     1970-01-01T00:00:00Z. Must be from 0001-01-01T00:00:00Z to
         *     9999-12-31T23:59:59Z inclusive.
         * @param nanoseconds - The non-negative fractions of a second at nanosecond
         *     resolution. Negative second values with fractions must still have
         *     non-negative nanoseconds values that count forward in time. Must be
         *     from 0 to 999,999,999 inclusive.
         */
        constructor(
        /**
         * The number of seconds of UTC time since Unix epoch 1970-01-01T00:00:00Z.
         */
        t, 
        /**
         * The fractions of a second at nanosecond resolution.*
         */
        e) {
            if (this.seconds = t, this.nanoseconds = e, e < 0) throw new K$1(q$1.INVALID_ARGUMENT, "Timestamp nanoseconds out of range: " + e);
            if (e >= 1e9) throw new K$1(q$1.INVALID_ARGUMENT, "Timestamp nanoseconds out of range: " + e);
            if (t < -62135596800) throw new K$1(q$1.INVALID_ARGUMENT, "Timestamp seconds out of range: " + t);
            // This will break in the year 10,000.
                    if (t >= 253402300800) throw new K$1(q$1.INVALID_ARGUMENT, "Timestamp seconds out of range: " + t);
        }
        /**
         * Creates a new timestamp with the current date, with millisecond precision.
         *
         * @returns a new timestamp representing the current date.
         */    static now() {
            return st.fromMillis(Date.now());
        }
        /**
         * Creates a new timestamp from the given date.
         *
         * @param date - The date to initialize the `Timestamp` from.
         * @returns A new `Timestamp` representing the same point in time as the given
         *     date.
         */    static fromDate(t) {
            return st.fromMillis(t.getTime());
        }
        /**
         * Creates a new timestamp from the given number of milliseconds.
         *
         * @param milliseconds - Number of milliseconds since Unix epoch
         *     1970-01-01T00:00:00Z.
         * @returns A new `Timestamp` representing the same point in time as the given
         *     number of milliseconds.
         */    static fromMillis(t) {
            const e = Math.floor(t / 1e3), n = Math.floor(1e6 * (t - 1e3 * e));
            return new st(e, n);
        }
        /**
         * Converts a `Timestamp` to a JavaScript `Date` object. This conversion
         * causes a loss of precision since `Date` objects only support millisecond
         * precision.
         *
         * @returns JavaScript `Date` object representing the same point in time as
         *     this `Timestamp`, with millisecond precision.
         */    toDate() {
            return new Date(this.toMillis());
        }
        /**
         * Converts a `Timestamp` to a numeric timestamp (in milliseconds since
         * epoch). This operation causes a loss of precision.
         *
         * @returns The point in time corresponding to this timestamp, represented as
         *     the number of milliseconds since Unix epoch 1970-01-01T00:00:00Z.
         */    toMillis() {
            return 1e3 * this.seconds + this.nanoseconds / 1e6;
        }
        _compareTo(t) {
            return this.seconds === t.seconds ? tt(this.nanoseconds, t.nanoseconds) : tt(this.seconds, t.seconds);
        }
        /**
         * Returns true if this `Timestamp` is equal to the provided one.
         *
         * @param other - The `Timestamp` to compare against.
         * @returns true if this `Timestamp` is equal to the provided one.
         */    isEqual(t) {
            return t.seconds === this.seconds && t.nanoseconds === this.nanoseconds;
        }
        /** Returns a textual representation of this `Timestamp`. */    toString() {
            return "Timestamp(seconds=" + this.seconds + ", nanoseconds=" + this.nanoseconds + ")";
        }
        /** Returns a JSON-serializable representation of this `Timestamp`. */    toJSON() {
            return {
                seconds: this.seconds,
                nanoseconds: this.nanoseconds
            };
        }
        /**
         * Converts this object to a primitive string, which allows `Timestamp` objects
         * to be compared using the `>`, `<=`, `>=` and `>` operators.
         */    valueOf() {
            // This method returns a string of the form <seconds>.<nanoseconds> where
            // <seconds> is translated to have a non-negative value and both <seconds>
            // and <nanoseconds> are left-padded with zeroes to be a consistent length.
            // Strings with this format then have a lexiographical ordering that matches
            // the expected ordering. The <seconds> translation is done to avoid having
            // a leading negative sign (i.e. a leading '-' character) in its string
            // representation, which would affect its lexiographical ordering.
            const t = this.seconds - -62135596800;
            // Note: Up to 12 decimal digits are required to represent all valid
            // 'seconds' values.
                    return String(t).padStart(12, "0") + "." + String(this.nanoseconds).padStart(9, "0");
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A version of a document in Firestore. This corresponds to the version
     * timestamp, such as update_time or read_time.
     */ class it {
        constructor(t) {
            this.timestamp = t;
        }
        static fromTimestamp(t) {
            return new it(t);
        }
        static min() {
            return new it(new st(0, 0));
        }
        compareTo(t) {
            return this.timestamp._compareTo(t.timestamp);
        }
        isEqual(t) {
            return this.timestamp.isEqual(t.timestamp);
        }
        /** Returns a number representation of the version for use in spec tests. */    toMicroseconds() {
            // Convert to microseconds.
            return 1e6 * this.timestamp.seconds + this.timestamp.nanoseconds / 1e3;
        }
        toString() {
            return "SnapshotVersion(" + this.timestamp.toString() + ")";
        }
        toTimestamp() {
            return this.timestamp;
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ function rt(t) {
        let e = 0;
        for (const n in t) Object.prototype.hasOwnProperty.call(t, n) && e++;
        return e;
    }

    function ot(t, e) {
        for (const n in t) Object.prototype.hasOwnProperty.call(t, n) && e(n, t[n]);
    }

    function at(t) {
        for (const e in t) if (Object.prototype.hasOwnProperty.call(t, e)) return !1;
        return !0;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Path represents an ordered sequence of string segments.
     */
    class ct {
        constructor(t, e, n) {
            void 0 === e ? e = 0 : e > t.length && M$1(), void 0 === n ? n = t.length - e : n > t.length - e && M$1(), 
            this.segments = t, this.offset = e, this.len = n;
        }
        get length() {
            return this.len;
        }
        isEqual(t) {
            return 0 === ct.comparator(this, t);
        }
        child(t) {
            const e = this.segments.slice(this.offset, this.limit());
            return t instanceof ct ? t.forEach((t => {
                e.push(t);
            })) : e.push(t), this.construct(e);
        }
        /** The index of one past the last segment of the path. */    limit() {
            return this.offset + this.length;
        }
        popFirst(t) {
            return t = void 0 === t ? 1 : t, this.construct(this.segments, this.offset + t, this.length - t);
        }
        popLast() {
            return this.construct(this.segments, this.offset, this.length - 1);
        }
        firstSegment() {
            return this.segments[this.offset];
        }
        lastSegment() {
            return this.get(this.length - 1);
        }
        get(t) {
            return this.segments[this.offset + t];
        }
        isEmpty() {
            return 0 === this.length;
        }
        isPrefixOf(t) {
            if (t.length < this.length) return !1;
            for (let e = 0; e < this.length; e++) if (this.get(e) !== t.get(e)) return !1;
            return !0;
        }
        isImmediateParentOf(t) {
            if (this.length + 1 !== t.length) return !1;
            for (let e = 0; e < this.length; e++) if (this.get(e) !== t.get(e)) return !1;
            return !0;
        }
        forEach(t) {
            for (let e = this.offset, n = this.limit(); e < n; e++) t(this.segments[e]);
        }
        toArray() {
            return this.segments.slice(this.offset, this.limit());
        }
        static comparator(t, e) {
            const n = Math.min(t.length, e.length);
            for (let s = 0; s < n; s++) {
                const n = t.get(s), i = e.get(s);
                if (n < i) return -1;
                if (n > i) return 1;
            }
            return t.length < e.length ? -1 : t.length > e.length ? 1 : 0;
        }
    }

    /**
     * A slash-separated path for navigating resources (documents and collections)
     * within Firestore.
     *
     * @internal
     */ class ut extends ct {
        construct(t, e, n) {
            return new ut(t, e, n);
        }
        canonicalString() {
            // NOTE: The client is ignorant of any path segments containing escape
            // sequences (e.g. __id123__) and just passes them through raw (they exist
            // for legacy reasons and should not be used frequently).
            return this.toArray().join("/");
        }
        toString() {
            return this.canonicalString();
        }
        /**
         * Creates a resource path from the given slash-delimited string. If multiple
         * arguments are provided, all components are combined. Leading and trailing
         * slashes from all components are ignored.
         */    static fromString(...t) {
            // NOTE: The client is ignorant of any path segments containing escape
            // sequences (e.g. __id123__) and just passes them through raw (they exist
            // for legacy reasons and should not be used frequently).
            const e = [];
            for (const n of t) {
                if (n.indexOf("//") >= 0) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid segment (${n}). Paths must not contain // in them.`);
                // Strip leading and traling slashed.
                            e.push(...n.split("/").filter((t => t.length > 0)));
            }
            return new ut(e);
        }
        static emptyPath() {
            return new ut([]);
        }
    }

    const ht = /^[_a-zA-Z][_a-zA-Z0-9]*$/;

    /**
     * A dot-separated path for navigating sub-objects within a document.
     * @internal
     */ class lt extends ct {
        construct(t, e, n) {
            return new lt(t, e, n);
        }
        /**
         * Returns true if the string could be used as a segment in a field path
         * without escaping.
         */    static isValidIdentifier(t) {
            return ht.test(t);
        }
        canonicalString() {
            return this.toArray().map((t => (t = t.replace(/\\/g, "\\\\").replace(/`/g, "\\`"), 
            lt.isValidIdentifier(t) || (t = "`" + t + "`"), t))).join(".");
        }
        toString() {
            return this.canonicalString();
        }
        /**
         * Returns true if this field references the key of a document.
         */    isKeyField() {
            return 1 === this.length && "__name__" === this.get(0);
        }
        /**
         * The field designating the key of a document.
         */    static keyField() {
            return new lt([ "__name__" ]);
        }
        /**
         * Parses a field string from the given server-formatted string.
         *
         * - Splitting the empty string is not allowed (for now at least).
         * - Empty segments within the string (e.g. if there are two consecutive
         *   separators) are not allowed.
         *
         * TODO(b/37244157): we should make this more strict. Right now, it allows
         * non-identifier path components, even if they aren't escaped.
         */    static fromServerFormat(t) {
            const e = [];
            let n = "", s = 0;
            const i = () => {
                if (0 === n.length) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid field path (${t}). Paths must not be empty, begin with '.', end with '.', or contain '..'`);
                e.push(n), n = "";
            };
            let r = !1;
            for (;s < t.length; ) {
                const e = t[s];
                if ("\\" === e) {
                    if (s + 1 === t.length) throw new K$1(q$1.INVALID_ARGUMENT, "Path has trailing escape character: " + t);
                    const e = t[s + 1];
                    if ("\\" !== e && "." !== e && "`" !== e) throw new K$1(q$1.INVALID_ARGUMENT, "Path has invalid escape sequence: " + t);
                    n += e, s += 2;
                } else "`" === e ? (r = !r, s++) : "." !== e || r ? (n += e, s++) : (i(), s++);
            }
            if (i(), r) throw new K$1(q$1.INVALID_ARGUMENT, "Unterminated ` in path: " + t);
            return new lt(e);
        }
        static emptyPath() {
            return new lt([]);
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Provides a set of fields that can be used to partially patch a document.
     * FieldMask is used in conjunction with ObjectValue.
     * Examples:
     *   foo - Overwrites foo entirely with the provided value. If foo is not
     *         present in the companion ObjectValue, the field is deleted.
     *   foo.bar - Overwrites only the field bar of the object foo.
     *             If foo is not an object, foo is replaced with an object
     *             containing foo
     */ class ft {
        constructor(t) {
            this.fields = t, 
            // TODO(dimond): validation of FieldMask
            // Sort the field mask to support `FieldMask.isEqual()` and assert below.
            t.sort(lt.comparator);
        }
        /**
         * Verifies that `fieldPath` is included by at least one field in this field
         * mask.
         *
         * This is an O(n) operation, where `n` is the size of the field mask.
         */    covers(t) {
            for (const e of this.fields) if (e.isPrefixOf(t)) return !0;
            return !1;
        }
        isEqual(t) {
            return et(this.fields, t.fields, ((t, e) => t.isEqual(e)));
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Immutable class that represents a "proto" byte string.
     *
     * Proto byte strings can either be Base64-encoded strings or Uint8Arrays when
     * sent on the wire. This class abstracts away this differentiation by holding
     * the proto byte string in a common class that must be converted into a string
     * before being sent as a proto.
     * @internal
     */ class wt {
        constructor(t) {
            this.binaryString = t;
        }
        static fromBase64String(t) {
            const e = atob(t);
            return new wt(e);
        }
        static fromUint8Array(t) {
            const e = 
            /**
     * Helper function to convert an Uint8array to a binary string.
     */
            function(t) {
                let e = "";
                for (let n = 0; n < t.length; ++n) e += String.fromCharCode(t[n]);
                return e;
            }
            /**
     * Helper function to convert a binary string to an Uint8Array.
     */ (t);
            return new wt(e);
        }
        toBase64() {
            return t = this.binaryString, btoa(t);
            /** Converts a binary string to a Base64 encoded string. */
            var t;
        }
        toUint8Array() {
            return function(t) {
                const e = new Uint8Array(t.length);
                for (let n = 0; n < t.length; n++) e[n] = t.charCodeAt(n);
                return e;
            }
            /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
            // A RegExp matching ISO 8601 UTC timestamps with optional fraction.
            (this.binaryString);
        }
        approximateByteSize() {
            return 2 * this.binaryString.length;
        }
        compareTo(t) {
            return tt(this.binaryString, t.binaryString);
        }
        isEqual(t) {
            return this.binaryString === t.binaryString;
        }
    }

    wt.EMPTY_BYTE_STRING = new wt("");

    const _t = new RegExp(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d+))?Z$/);

    /**
     * Converts the possible Proto values for a timestamp value into a "seconds and
     * nanos" representation.
     */ function mt(t) {
        // The json interface (for the browser) will return an iso timestamp string,
        // while the proto js library (for node) will return a
        // google.protobuf.Timestamp instance.
        if (L$1(!!t), "string" == typeof t) {
            // The date string can have higher precision (nanos) than the Date class
            // (millis), so we do some custom parsing here.
            // Parse the nanos right out of the string.
            let e = 0;
            const n = _t.exec(t);
            if (L$1(!!n), n[1]) {
                // Pad the fraction out to 9 digits (nanos).
                let t = n[1];
                t = (t + "000000000").substr(0, 9), e = Number(t);
            }
            // Parse the date to get the seconds.
                    const s = new Date(t);
            return {
                seconds: Math.floor(s.getTime() / 1e3),
                nanos: e
            };
        }
        return {
            seconds: gt(t.seconds),
            nanos: gt(t.nanos)
        };
    }

    /**
     * Converts the possible Proto types for numbers into a JavaScript number.
     * Returns 0 if the value is not numeric.
     */ function gt(t) {
        // TODO(bjornick): Handle int64 greater than 53 bits.
        return "number" == typeof t ? t : "string" == typeof t ? Number(t) : 0;
    }

    /** Converts the possible Proto types for Blobs into a ByteString. */ function yt(t) {
        return "string" == typeof t ? wt.fromBase64String(t) : wt.fromUint8Array(t);
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Represents a locally-applied ServerTimestamp.
     *
     * Server Timestamps are backed by MapValues that contain an internal field
     * `__type__` with a value of `server_timestamp`. The previous value and local
     * write time are stored in its `__previous_value__` and `__local_write_time__`
     * fields respectively.
     *
     * Notes:
     * - ServerTimestampValue instances are created as the result of applying a
     *   transform. They can only exist in the local view of a document. Therefore
     *   they do not need to be parsed or serialized.
     * - When evaluated locally (e.g. for snapshot.data()), they by default
     *   evaluate to `null`. This behavior can be configured by passing custom
     *   FieldValueOptions to value().
     * - With respect to other ServerTimestampValues, they sort by their
     *   localWriteTime.
     */ function pt(t) {
        var e, n;
        return "server_timestamp" === (null === (n = ((null === (e = null == t ? void 0 : t.mapValue) || void 0 === e ? void 0 : e.fields) || {}).__type__) || void 0 === n ? void 0 : n.stringValue);
    }

    /**
     * Creates a new ServerTimestamp proto value (using the internal format).
     */
    /**
     * Returns the value of the field before this ServerTimestamp was set.
     *
     * Preserving the previous values allows the user to display the last resoled
     * value until the backend responds with the timestamp.
     */
    function Et(t) {
        const e = t.mapValue.fields.__previous_value__;
        return pt(e) ? Et(e) : e;
    }

    /**
     * Returns the local time at which this timestamp was first set.
     */ function Tt(t) {
        const e = mt(t.mapValue.fields.__local_write_time__.timestampValue);
        return new st(e.seconds, e.nanos);
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /** Sentinel value that sorts before any Mutation Batch ID. */
    /**
     * Returns whether a variable is either undefined or null.
     */
    function It(t) {
        return null == t;
    }

    /** Returns whether the value represents -0. */ function At(t) {
        // Detect if the value is -0.0. Based on polyfill from
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
        return 0 === t && 1 / t == -1 / 0;
    }

    /**
     * Returns whether a value is an integer and in the safe integer range
     * @param value - The value to test for being an integer and in the safe range
     */ function Rt(t) {
        return "number" == typeof t && Number.isInteger(t) && !At(t) && t <= Number.MAX_SAFE_INTEGER && t >= Number.MIN_SAFE_INTEGER;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * @internal
     */ class Pt {
        constructor(t) {
            this.path = t;
        }
        static fromPath(t) {
            return new Pt(ut.fromString(t));
        }
        static fromName(t) {
            return new Pt(ut.fromString(t).popFirst(5));
        }
        /** Returns true if the document is in the specified collectionId. */    hasCollectionId(t) {
            return this.path.length >= 2 && this.path.get(this.path.length - 2) === t;
        }
        isEqual(t) {
            return null !== t && 0 === ut.comparator(this.path, t.path);
        }
        toString() {
            return this.path.toString();
        }
        static comparator(t, e) {
            return ut.comparator(t.path, e.path);
        }
        static isDocumentKey(t) {
            return t.length % 2 == 0;
        }
        /**
         * Creates and returns a new document key with the given segments.
         *
         * @param segments - The segments of the path to the document
         * @returns A new instance of DocumentKey
         */    static fromSegments(t) {
            return new Pt(new ut(t.slice()));
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /** Extracts the backend's type order for the provided value. */ function bt(t) {
        return "nullValue" in t ? 0 /* NullValue */ : "booleanValue" in t ? 1 /* BooleanValue */ : "integerValue" in t || "doubleValue" in t ? 2 /* NumberValue */ : "timestampValue" in t ? 3 /* TimestampValue */ : "stringValue" in t ? 5 /* StringValue */ : "bytesValue" in t ? 6 /* BlobValue */ : "referenceValue" in t ? 7 /* RefValue */ : "geoPointValue" in t ? 8 /* GeoPointValue */ : "arrayValue" in t ? 9 /* ArrayValue */ : "mapValue" in t ? pt(t) ? 4 /* ServerTimestampValue */ : 10 /* ObjectValue */ : M$1();
    }

    /** Tests `left` and `right` for equality based on the backend semantics. */ function vt(t, e) {
        const n = bt(t);
        if (n !== bt(e)) return !1;
        switch (n) {
          case 0 /* NullValue */ :
            return !0;

          case 1 /* BooleanValue */ :
            return t.booleanValue === e.booleanValue;

          case 4 /* ServerTimestampValue */ :
            return Tt(t).isEqual(Tt(e));

          case 3 /* TimestampValue */ :
            return function(t, e) {
                if ("string" == typeof t.timestampValue && "string" == typeof e.timestampValue && t.timestampValue.length === e.timestampValue.length) 
                // Use string equality for ISO 8601 timestamps
                return t.timestampValue === e.timestampValue;
                const n = mt(t.timestampValue), s = mt(e.timestampValue);
                return n.seconds === s.seconds && n.nanos === s.nanos;
            }(t, e);

          case 5 /* StringValue */ :
            return t.stringValue === e.stringValue;

          case 6 /* BlobValue */ :
            return function(t, e) {
                return yt(t.bytesValue).isEqual(yt(e.bytesValue));
            }(t, e);

          case 7 /* RefValue */ :
            return t.referenceValue === e.referenceValue;

          case 8 /* GeoPointValue */ :
            return function(t, e) {
                return gt(t.geoPointValue.latitude) === gt(e.geoPointValue.latitude) && gt(t.geoPointValue.longitude) === gt(e.geoPointValue.longitude);
            }(t, e);

          case 2 /* NumberValue */ :
            return function(t, e) {
                if ("integerValue" in t && "integerValue" in e) return gt(t.integerValue) === gt(e.integerValue);
                if ("doubleValue" in t && "doubleValue" in e) {
                    const n = gt(t.doubleValue), s = gt(e.doubleValue);
                    return n === s ? At(n) === At(s) : isNaN(n) && isNaN(s);
                }
                return !1;
            }(t, e);

          case 9 /* ArrayValue */ :
            return et(t.arrayValue.values || [], e.arrayValue.values || [], vt);

          case 10 /* ObjectValue */ :
            return function(t, e) {
                const n = t.mapValue.fields || {}, s = e.mapValue.fields || {};
                if (rt(n) !== rt(s)) return !1;
                for (const t in n) if (n.hasOwnProperty(t) && (void 0 === s[t] || !vt(n[t], s[t]))) return !1;
                return !0;
            }
            /** Returns true if the ArrayValue contains the specified element. */ (t, e);

          default:
            return M$1();
        }
    }

    function Vt(t, e) {
        return void 0 !== (t.values || []).find((t => vt(t, e)));
    }

    function St(t, e) {
        const n = bt(t), s = bt(e);
        if (n !== s) return tt(n, s);
        switch (n) {
          case 0 /* NullValue */ :
            return 0;

          case 1 /* BooleanValue */ :
            return tt(t.booleanValue, e.booleanValue);

          case 2 /* NumberValue */ :
            return function(t, e) {
                const n = gt(t.integerValue || t.doubleValue), s = gt(e.integerValue || e.doubleValue);
                return n < s ? -1 : n > s ? 1 : n === s ? 0 : 
                // one or both are NaN.
                isNaN(n) ? isNaN(s) ? 0 : -1 : 1;
            }(t, e);

          case 3 /* TimestampValue */ :
            return Dt(t.timestampValue, e.timestampValue);

          case 4 /* ServerTimestampValue */ :
            return Dt(Tt(t), Tt(e));

          case 5 /* StringValue */ :
            return tt(t.stringValue, e.stringValue);

          case 6 /* BlobValue */ :
            return function(t, e) {
                const n = yt(t), s = yt(e);
                return n.compareTo(s);
            }(t.bytesValue, e.bytesValue);

          case 7 /* RefValue */ :
            return function(t, e) {
                const n = t.split("/"), s = e.split("/");
                for (let t = 0; t < n.length && t < s.length; t++) {
                    const e = tt(n[t], s[t]);
                    if (0 !== e) return e;
                }
                return tt(n.length, s.length);
            }(t.referenceValue, e.referenceValue);

          case 8 /* GeoPointValue */ :
            return function(t, e) {
                const n = tt(gt(t.latitude), gt(e.latitude));
                if (0 !== n) return n;
                return tt(gt(t.longitude), gt(e.longitude));
            }(t.geoPointValue, e.geoPointValue);

          case 9 /* ArrayValue */ :
            return function(t, e) {
                const n = t.values || [], s = e.values || [];
                for (let t = 0; t < n.length && t < s.length; ++t) {
                    const e = St(n[t], s[t]);
                    if (e) return e;
                }
                return tt(n.length, s.length);
            }(t.arrayValue, e.arrayValue);

          case 10 /* ObjectValue */ :
            return function(t, e) {
                const n = t.fields || {}, s = Object.keys(n), i = e.fields || {}, r = Object.keys(i);
                // Even though MapValues are likely sorted correctly based on their insertion
                // order (e.g. when received from the backend), local modifications can bring
                // elements out of order. We need to re-sort the elements to ensure that
                // canonical IDs are independent of insertion order.
                s.sort(), r.sort();
                for (let t = 0; t < s.length && t < r.length; ++t) {
                    const e = tt(s[t], r[t]);
                    if (0 !== e) return e;
                    const o = St(n[s[t]], i[r[t]]);
                    if (0 !== o) return o;
                }
                return tt(s.length, r.length);
            }
            /**
     * Generates the canonical ID for the provided field value (as used in Target
     * serialization).
     */ (t.mapValue, e.mapValue);

          default:
            throw M$1();
        }
    }

    function Dt(t, e) {
        if ("string" == typeof t && "string" == typeof e && t.length === e.length) return tt(t, e);
        const n = mt(t), s = mt(e), i = tt(n.seconds, s.seconds);
        return 0 !== i ? i : tt(n.nanos, s.nanos);
    }

    function Ct(t) {
        return Nt(t);
    }

    function Nt(t) {
        return "nullValue" in t ? "null" : "booleanValue" in t ? "" + t.booleanValue : "integerValue" in t ? "" + t.integerValue : "doubleValue" in t ? "" + t.doubleValue : "timestampValue" in t ? function(t) {
            const e = mt(t);
            return `time(${e.seconds},${e.nanos})`;
        }(t.timestampValue) : "stringValue" in t ? t.stringValue : "bytesValue" in t ? yt(t.bytesValue).toBase64() : "referenceValue" in t ? (n = t.referenceValue, 
        Pt.fromName(n).toString()) : "geoPointValue" in t ? `geo(${(e = t.geoPointValue).latitude},${e.longitude})` : "arrayValue" in t ? function(t) {
            let e = "[", n = !0;
            for (const s of t.values || []) n ? n = !1 : e += ",", e += Nt(s);
            return e + "]";
        }
        /** Returns a reference value for the provided database and key. */ (t.arrayValue) : "mapValue" in t ? function(t) {
            // Iteration order in JavaScript is not guaranteed. To ensure that we generate
            // matching canonical IDs for identical maps, we need to sort the keys.
            const e = Object.keys(t.fields || {}).sort();
            let n = "{", s = !0;
            for (const i of e) s ? s = !1 : n += ",", n += `${i}:${Nt(t.fields[i])}`;
            return n + "}";
        }(t.mapValue) : M$1();
        var e, n;
    }

    function xt(t, e) {
        return {
            referenceValue: `projects/${t.projectId}/databases/${t.database}/documents/${e.path.canonicalString()}`
        };
    }

    /** Returns true if `value` is an IntegerValue . */ function kt(t) {
        return !!t && "integerValue" in t;
    }

    /** Returns true if `value` is a DoubleValue. */
    /** Returns true if `value` is an ArrayValue. */
    function $t(t) {
        return !!t && "arrayValue" in t;
    }

    /** Returns true if `value` is a NullValue. */ function Ot(t) {
        return !!t && "nullValue" in t;
    }

    /** Returns true if `value` is NaN. */ function Ft(t) {
        return !!t && "doubleValue" in t && isNaN(Number(t.doubleValue));
    }

    /** Returns true if `value` is a MapValue. */ function Mt(t) {
        return !!t && "mapValue" in t;
    }

    /** Creates a deep copy of `source`. */ function Lt(t) {
        if (t.geoPointValue) return {
            geoPointValue: Object.assign({}, t.geoPointValue)
        };
        if (t.timestampValue && "object" == typeof t.timestampValue) return {
            timestampValue: Object.assign({}, t.timestampValue)
        };
        if (t.mapValue) {
            const e = {
                mapValue: {
                    fields: {}
                }
            };
            return ot(t.mapValue.fields, ((t, n) => e.mapValue.fields[t] = Lt(n))), e;
        }
        if (t.arrayValue) {
            const e = {
                arrayValue: {
                    values: []
                }
            };
            for (let n = 0; n < (t.arrayValue.values || []).length; ++n) e.arrayValue.values[n] = Lt(t.arrayValue.values[n]);
            return e;
        }
        return Object.assign({}, t);
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * An ObjectValue represents a MapValue in the Firestore Proto and offers the
     * ability to add and remove fields (via the ObjectValueBuilder).
     */ class Bt {
        constructor(t) {
            this.value = t;
        }
        static empty() {
            return new Bt({
                mapValue: {}
            });
        }
        /**
         * Returns the value at the given path or null.
         *
         * @param path - the path to search
         * @returns The value at the path or null if the path is not set.
         */    field(t) {
            if (t.isEmpty()) return this.value;
            {
                let e = this.value;
                for (let n = 0; n < t.length - 1; ++n) if (e = (e.mapValue.fields || {})[t.get(n)], 
                !Mt(e)) return null;
                return e = (e.mapValue.fields || {})[t.lastSegment()], e || null;
            }
        }
        /**
         * Sets the field to the provided value.
         *
         * @param path - The field path to set.
         * @param value - The value to set.
         */    set(t, e) {
            this.getFieldsMap(t.popLast())[t.lastSegment()] = Lt(e);
        }
        /**
         * Sets the provided fields to the provided values.
         *
         * @param data - A map of fields to values (or null for deletes).
         */    setAll(t) {
            let e = lt.emptyPath(), n = {}, s = [];
            t.forEach(((t, i) => {
                if (!e.isImmediateParentOf(i)) {
                    // Insert the accumulated changes at this parent location
                    const t = this.getFieldsMap(e);
                    this.applyChanges(t, n, s), n = {}, s = [], e = i.popLast();
                }
                t ? n[i.lastSegment()] = Lt(t) : s.push(i.lastSegment());
            }));
            const i = this.getFieldsMap(e);
            this.applyChanges(i, n, s);
        }
        /**
         * Removes the field at the specified path. If there is no field at the
         * specified path, nothing is changed.
         *
         * @param path - The field path to remove.
         */    delete(t) {
            const e = this.field(t.popLast());
            Mt(e) && e.mapValue.fields && delete e.mapValue.fields[t.lastSegment()];
        }
        isEqual(t) {
            return vt(this.value, t.value);
        }
        /**
         * Returns the map that contains the leaf element of `path`. If the parent
         * entry does not yet exist, or if it is not a map, a new map will be created.
         */    getFieldsMap(t) {
            let e = this.value;
            e.mapValue.fields || (e.mapValue = {
                fields: {}
            });
            for (let n = 0; n < t.length; ++n) {
                let s = e.mapValue.fields[t.get(n)];
                Mt(s) && s.mapValue.fields || (s = {
                    mapValue: {
                        fields: {}
                    }
                }, e.mapValue.fields[t.get(n)] = s), e = s;
            }
            return e.mapValue.fields;
        }
        /**
         * Modifies `fieldsMap` by adding, replacing or deleting the specified
         * entries.
         */    applyChanges(t, e, n) {
            ot(e, ((e, n) => t[e] = n));
            for (const e of n) delete t[e];
        }
        clone() {
            return new Bt(Lt(this.value));
        }
    }

    /**
     * Returns a FieldMask built from all fields in a MapValue.
     */ function Ut(t) {
        const e = [];
        return ot(t.fields, ((t, n) => {
            const s = new lt([ t ]);
            if (Mt(n)) {
                const t = Ut(n.mapValue).fields;
                if (0 === t.length) 
                // Preserve the empty map by adding it to the FieldMask.
                e.push(s); else 
                // For nested and non-empty ObjectValues, add the FieldPath of the
                // leaf nodes.
                for (const n of t) e.push(s.child(n));
            } else 
            // For nested and non-empty ObjectValues, add the FieldPath of the leaf
            // nodes.
            e.push(s);
        })), new ft(e);
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Represents a document in Firestore with a key, version, data and whether it
     * has local mutations applied to it.
     *
     * Documents can transition between states via `convertToFoundDocument()`,
     * `convertToNoDocument()` and `convertToUnknownDocument()`. If a document does
     * not transition to one of these states even after all mutations have been
     * applied, `isValidDocument()` returns false and the document should be removed
     * from all views.
     */ class qt {
        constructor(t, e, n, s, i) {
            this.key = t, this.documentType = e, this.version = n, this.data = s, this.documentState = i;
        }
        /**
         * Creates a document with no known version or data, but which can serve as
         * base document for mutations.
         */    static newInvalidDocument(t) {
            return new qt(t, 0 /* INVALID */ , it.min(), Bt.empty(), 0 /* SYNCED */);
        }
        /**
         * Creates a new document that is known to exist with the given data at the
         * given version.
         */    static newFoundDocument(t, e, n) {
            return new qt(t, 1 /* FOUND_DOCUMENT */ , e, n, 0 /* SYNCED */);
        }
        /** Creates a new document that is known to not exist at the given version. */    static newNoDocument(t, e) {
            return new qt(t, 2 /* NO_DOCUMENT */ , e, Bt.empty(), 0 /* SYNCED */);
        }
        /**
         * Creates a new document that is known to exist at the given version but
         * whose data is not known (e.g. a document that was updated without a known
         * base document).
         */    static newUnknownDocument(t, e) {
            return new qt(t, 3 /* UNKNOWN_DOCUMENT */ , e, Bt.empty(), 2 /* HAS_COMMITTED_MUTATIONS */);
        }
        /**
         * Changes the document type to indicate that it exists and that its version
         * and data are known.
         */    convertToFoundDocument(t, e) {
            return this.version = t, this.documentType = 1 /* FOUND_DOCUMENT */ , this.data = e, 
            this.documentState = 0 /* SYNCED */ , this;
        }
        /**
         * Changes the document type to indicate that it doesn't exist at the given
         * version.
         */    convertToNoDocument(t) {
            return this.version = t, this.documentType = 2 /* NO_DOCUMENT */ , this.data = Bt.empty(), 
            this.documentState = 0 /* SYNCED */ , this;
        }
        /**
         * Changes the document type to indicate that it exists at a given version but
         * that its data is not known (e.g. a document that was updated without a known
         * base document).
         */    convertToUnknownDocument(t) {
            return this.version = t, this.documentType = 3 /* UNKNOWN_DOCUMENT */ , this.data = Bt.empty(), 
            this.documentState = 2 /* HAS_COMMITTED_MUTATIONS */ , this;
        }
        setHasCommittedMutations() {
            return this.documentState = 2 /* HAS_COMMITTED_MUTATIONS */ , this;
        }
        setHasLocalMutations() {
            return this.documentState = 1 /* HAS_LOCAL_MUTATIONS */ , this;
        }
        get hasLocalMutations() {
            return 1 /* HAS_LOCAL_MUTATIONS */ === this.documentState;
        }
        get hasCommittedMutations() {
            return 2 /* HAS_COMMITTED_MUTATIONS */ === this.documentState;
        }
        get hasPendingWrites() {
            return this.hasLocalMutations || this.hasCommittedMutations;
        }
        isValidDocument() {
            return 0 /* INVALID */ !== this.documentType;
        }
        isFoundDocument() {
            return 1 /* FOUND_DOCUMENT */ === this.documentType;
        }
        isNoDocument() {
            return 2 /* NO_DOCUMENT */ === this.documentType;
        }
        isUnknownDocument() {
            return 3 /* UNKNOWN_DOCUMENT */ === this.documentType;
        }
        isEqual(t) {
            return t instanceof qt && this.key.isEqual(t.key) && this.version.isEqual(t.version) && this.documentType === t.documentType && this.documentState === t.documentState && this.data.isEqual(t.data);
        }
        clone() {
            return new qt(this.key, this.documentType, this.version, this.data.clone(), this.documentState);
        }
        toString() {
            return `Document(${this.key}, ${this.version}, ${JSON.stringify(this.data.value)}, {documentType: ${this.documentType}}), {documentState: ${this.documentState}})`;
        }
    }

    /**
     * Compares the value for field `field` in the provided documents. Throws if
     * the field does not exist in both documents.
     */
    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    // Visible for testing
    class Kt {
        constructor(t, e = null, n = [], s = [], i = null, r = null, o = null) {
            this.path = t, this.collectionGroup = e, this.orderBy = n, this.filters = s, this.limit = i, 
            this.startAt = r, this.endAt = o, this.A = null;
        }
    }

    /**
     * Initializes a Target with a path and optional additional query constraints.
     * Path must currently be empty if this is a collection group query.
     *
     * NOTE: you should always construct `Target` from `Query.toTarget` instead of
     * using this factory method, because `Query` provides an implicit `orderBy`
     * property.
     */ function jt(t, e = null, n = [], s = [], i = null, r = null, o = null) {
        return new Kt(t, e, n, s, i, r, o);
    }

    function Qt(t) {
        const e = U$1(t);
        if (null === e.A) {
            let t = e.path.canonicalString();
            null !== e.collectionGroup && (t += "|cg:" + e.collectionGroup), t += "|f:", t += e.filters.map((t => Jt(t))).join(","), 
            t += "|ob:", t += e.orderBy.map((t => function(t) {
                // TODO(b/29183165): Make this collision robust.
                return t.field.canonicalString() + t.dir;
            }(t))).join(","), It(e.limit) || (t += "|l:", t += e.limit), e.startAt && (t += "|lb:", 
            t += oe(e.startAt)), e.endAt && (t += "|ub:", t += oe(e.endAt)), e.A = t;
        }
        return e.A;
    }

    function Wt(t) {
        let e = t.path.canonicalString();
        return null !== t.collectionGroup && (e += " collectionGroup=" + t.collectionGroup), 
        t.filters.length > 0 && (e += `, filters: [${t.filters.map((t => {
        return `${(e = t).field.canonicalString()} ${e.op} ${Ct(e.value)}`;
        /** Returns a debug description for `filter`. */
        var e;
        /** Filter that matches on key fields (i.e. '__name__'). */    })).join(", ")}]`), 
        It(t.limit) || (e += ", limit: " + t.limit), t.orderBy.length > 0 && (e += `, orderBy: [${t.orderBy.map((t => function(t) {
        return `${t.field.canonicalString()} (${t.dir})`;
    }(t))).join(", ")}]`), t.startAt && (e += ", startAt: " + oe(t.startAt)), t.endAt && (e += ", endAt: " + oe(t.endAt)), 
        `Target(${e})`;
    }

    function Gt(t, e) {
        if (t.limit !== e.limit) return !1;
        if (t.orderBy.length !== e.orderBy.length) return !1;
        for (let n = 0; n < t.orderBy.length; n++) if (!ce(t.orderBy[n], e.orderBy[n])) return !1;
        if (t.filters.length !== e.filters.length) return !1;
        for (let i = 0; i < t.filters.length; i++) if (n = t.filters[i], s = e.filters[i], 
        n.op !== s.op || !n.field.isEqual(s.field) || !vt(n.value, s.value)) return !1;
        var n, s;
        return t.collectionGroup === e.collectionGroup && (!!t.path.isEqual(e.path) && (!!he(t.startAt, e.startAt) && he(t.endAt, e.endAt)));
    }

    function zt(t) {
        return Pt.isDocumentKey(t.path) && null === t.collectionGroup && 0 === t.filters.length;
    }

    class Ht extends class {} {
        constructor(t, e, n) {
            super(), this.field = t, this.op = e, this.value = n;
        }
        /**
         * Creates a filter based on the provided arguments.
         */    static create(t, e, n) {
            return t.isKeyField() ? "in" /* IN */ === e || "not-in" /* NOT_IN */ === e ? this.R(t, e, n) : new Yt(t, e, n) : "array-contains" /* ARRAY_CONTAINS */ === e ? new ee(t, n) : "in" /* IN */ === e ? new ne(t, n) : "not-in" /* NOT_IN */ === e ? new se(t, n) : "array-contains-any" /* ARRAY_CONTAINS_ANY */ === e ? new ie(t, n) : new Ht(t, e, n);
        }
        static R(t, e, n) {
            return "in" /* IN */ === e ? new Xt(t, n) : new Zt(t, n);
        }
        matches(t) {
            const e = t.data.field(this.field);
            // Types do not have to match in NOT_EQUAL filters.
                    return "!=" /* NOT_EQUAL */ === this.op ? null !== e && this.P(St(e, this.value)) : null !== e && bt(this.value) === bt(e) && this.P(St(e, this.value));
            // Only compare types with matching backend order (such as double and int).
            }
        P(t) {
            switch (this.op) {
              case "<" /* LESS_THAN */ :
                return t < 0;

              case "<=" /* LESS_THAN_OR_EQUAL */ :
                return t <= 0;

              case "==" /* EQUAL */ :
                return 0 === t;

              case "!=" /* NOT_EQUAL */ :
                return 0 !== t;

              case ">" /* GREATER_THAN */ :
                return t > 0;

              case ">=" /* GREATER_THAN_OR_EQUAL */ :
                return t >= 0;

              default:
                return M$1();
            }
        }
        v() {
            return [ "<" /* LESS_THAN */ , "<=" /* LESS_THAN_OR_EQUAL */ , ">" /* GREATER_THAN */ , ">=" /* GREATER_THAN_OR_EQUAL */ , "!=" /* NOT_EQUAL */ , "not-in" /* NOT_IN */ ].indexOf(this.op) >= 0;
        }
    }

    function Jt(t) {
        // TODO(b/29183165): Technically, this won't be unique if two values have
        // the same description, such as the int 3 and the string "3". So we should
        // add the types in here somehow, too.
        return t.field.canonicalString() + t.op.toString() + Ct(t.value);
    }

    class Yt extends Ht {
        constructor(t, e, n) {
            super(t, e, n), this.key = Pt.fromName(n.referenceValue);
        }
        matches(t) {
            const e = Pt.comparator(t.key, this.key);
            return this.P(e);
        }
    }

    /** Filter that matches on key fields within an array. */ class Xt extends Ht {
        constructor(t, e) {
            super(t, "in" /* IN */ , e), this.keys = te("in" /* IN */ , e);
        }
        matches(t) {
            return this.keys.some((e => e.isEqual(t.key)));
        }
    }

    /** Filter that matches on key fields not present within an array. */ class Zt extends Ht {
        constructor(t, e) {
            super(t, "not-in" /* NOT_IN */ , e), this.keys = te("not-in" /* NOT_IN */ , e);
        }
        matches(t) {
            return !this.keys.some((e => e.isEqual(t.key)));
        }
    }

    function te(t, e) {
        var n;
        return ((null === (n = e.arrayValue) || void 0 === n ? void 0 : n.values) || []).map((t => Pt.fromName(t.referenceValue)));
    }

    /** A Filter that implements the array-contains operator. */ class ee extends Ht {
        constructor(t, e) {
            super(t, "array-contains" /* ARRAY_CONTAINS */ , e);
        }
        matches(t) {
            const e = t.data.field(this.field);
            return $t(e) && Vt(e.arrayValue, this.value);
        }
    }

    /** A Filter that implements the IN operator. */ class ne extends Ht {
        constructor(t, e) {
            super(t, "in" /* IN */ , e);
        }
        matches(t) {
            const e = t.data.field(this.field);
            return null !== e && Vt(this.value.arrayValue, e);
        }
    }

    /** A Filter that implements the not-in operator. */ class se extends Ht {
        constructor(t, e) {
            super(t, "not-in" /* NOT_IN */ , e);
        }
        matches(t) {
            if (Vt(this.value.arrayValue, {
                nullValue: "NULL_VALUE"
            })) return !1;
            const e = t.data.field(this.field);
            return null !== e && !Vt(this.value.arrayValue, e);
        }
    }

    /** A Filter that implements the array-contains-any operator. */ class ie extends Ht {
        constructor(t, e) {
            super(t, "array-contains-any" /* ARRAY_CONTAINS_ANY */ , e);
        }
        matches(t) {
            const e = t.data.field(this.field);
            return !(!$t(e) || !e.arrayValue.values) && e.arrayValue.values.some((t => Vt(this.value.arrayValue, t)));
        }
    }

    /**
     * Represents a bound of a query.
     *
     * The bound is specified with the given components representing a position and
     * whether it's just before or just after the position (relative to whatever the
     * query order is).
     *
     * The position represents a logical index position for a query. It's a prefix
     * of values for the (potentially implicit) order by clauses of a query.
     *
     * Bound provides a function to determine whether a document comes before or
     * after a bound. This is influenced by whether the position is just before or
     * just after the provided values.
     */ class re {
        constructor(t, e) {
            this.position = t, this.before = e;
        }
    }

    function oe(t) {
        // TODO(b/29183165): Make this collision robust.
        return `${t.before ? "b" : "a"}:${t.position.map((t => Ct(t))).join(",")}`;
    }

    /**
     * An ordering on a field, in some Direction. Direction defaults to ASCENDING.
     */ class ae {
        constructor(t, e = "asc" /* ASCENDING */) {
            this.field = t, this.dir = e;
        }
    }

    function ce(t, e) {
        return t.dir === e.dir && t.field.isEqual(e.field);
    }

    /**
     * Returns true if a document sorts before a bound using the provided sort
     * order.
     */ function ue(t, e, n) {
        let s = 0;
        for (let i = 0; i < t.position.length; i++) {
            const r = e[i], o = t.position[i];
            if (r.field.isKeyField()) s = Pt.comparator(Pt.fromName(o.referenceValue), n.key); else {
                s = St(o, n.data.field(r.field));
            }
            if ("desc" /* DESCENDING */ === r.dir && (s *= -1), 0 !== s) break;
        }
        return t.before ? s <= 0 : s < 0;
    }

    function he(t, e) {
        if (null === t) return null === e;
        if (null === e) return !1;
        if (t.before !== e.before || t.position.length !== e.position.length) return !1;
        for (let n = 0; n < t.position.length; n++) {
            if (!vt(t.position[n], e.position[n])) return !1;
        }
        return !0;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Query encapsulates all the query attributes we support in the SDK. It can
     * be run against the LocalStore, as well as be converted to a `Target` to
     * query the RemoteStore results.
     *
     * Visible for testing.
     */ class le {
        /**
         * Initializes a Query with a path and optional additional query constraints.
         * Path must currently be empty if this is a collection group query.
         */
        constructor(t, e = null, n = [], s = [], i = null, r = "F" /* First */ , o = null, a = null) {
            this.path = t, this.collectionGroup = e, this.explicitOrderBy = n, this.filters = s, 
            this.limit = i, this.limitType = r, this.startAt = o, this.endAt = a, this.V = null, 
            // The corresponding `Target` of this `Query` instance.
            this.S = null, this.startAt, this.endAt;
        }
    }

    /** Creates a new Query instance with the options provided. */ function fe(t, e, n, s, i, r, o, a) {
        return new le(t, e, n, s, i, r, o, a);
    }

    /** Creates a new Query for a query that matches all documents at `path` */ function de(t) {
        return new le(t);
    }

    /**
     * Helper to convert a collection group query into a collection query at a
     * specific path. This is used when executing collection group queries, since
     * we have to split the query into a set of collection queries at multiple
     * paths.
     */ function we(t) {
        return !It(t.limit) && "F" /* First */ === t.limitType;
    }

    function _e(t) {
        return !It(t.limit) && "L" /* Last */ === t.limitType;
    }

    function me(t) {
        return t.explicitOrderBy.length > 0 ? t.explicitOrderBy[0].field : null;
    }

    function ge(t) {
        for (const e of t.filters) if (e.v()) return e.field;
        return null;
    }

    /**
     * Checks if any of the provided Operators are included in the query and
     * returns the first one that is, or null if none are.
     */
    /**
     * Returns whether the query matches a collection group rather than a specific
     * collection.
     */
    function ye(t) {
        return null !== t.collectionGroup;
    }

    /**
     * Returns the implicit order by constraint that is used to execute the Query,
     * which can be different from the order by constraints the user provided (e.g.
     * the SDK and backend always orders by `__name__`).
     */ function pe(t) {
        const e = U$1(t);
        if (null === e.V) {
            e.V = [];
            const t = ge(e), n = me(e);
            if (null !== t && null === n) 
            // In order to implicitly add key ordering, we must also add the
            // inequality filter field for it to be a valid query.
            // Note that the default inequality field and key ordering is ascending.
            t.isKeyField() || e.V.push(new ae(t)), e.V.push(new ae(lt.keyField(), "asc" /* ASCENDING */)); else {
                let t = !1;
                for (const n of e.explicitOrderBy) e.V.push(n), n.field.isKeyField() && (t = !0);
                if (!t) {
                    // The order of the implicit key ordering always matches the last
                    // explicit order by
                    const t = e.explicitOrderBy.length > 0 ? e.explicitOrderBy[e.explicitOrderBy.length - 1].dir : "asc" /* ASCENDING */;
                    e.V.push(new ae(lt.keyField(), t));
                }
            }
        }
        return e.V;
    }

    /**
     * Converts this `Query` instance to it's corresponding `Target` representation.
     */ function Ee(t) {
        const e = U$1(t);
        if (!e.S) if ("F" /* First */ === e.limitType) e.S = jt(e.path, e.collectionGroup, pe(e), e.filters, e.limit, e.startAt, e.endAt); else {
            // Flip the orderBy directions since we want the last results
            const t = [];
            for (const n of pe(e)) {
                const e = "desc" /* DESCENDING */ === n.dir ? "asc" /* ASCENDING */ : "desc" /* DESCENDING */;
                t.push(new ae(n.field, e));
            }
            // We need to swap the cursors to match the now-flipped query ordering.
                    const n = e.endAt ? new re(e.endAt.position, !e.endAt.before) : null, s = e.startAt ? new re(e.startAt.position, !e.startAt.before) : null;
            // Now return as a LimitType.First query.
            e.S = jt(e.path, e.collectionGroup, t, e.filters, e.limit, n, s);
        }
        return e.S;
    }

    function Te(t, e, n) {
        return new le(t.path, t.collectionGroup, t.explicitOrderBy.slice(), t.filters.slice(), e, n, t.startAt, t.endAt);
    }

    function Ie(t, e) {
        return Gt(Ee(t), Ee(e)) && t.limitType === e.limitType;
    }

    // TODO(b/29183165): This is used to get a unique string from a query to, for
    // example, use as a dictionary key, but the implementation is subject to
    // collisions. Make it collision-free.
    function Ae(t) {
        return `${Qt(Ee(t))}|lt:${t.limitType}`;
    }

    function Re(t) {
        return `Query(target=${Wt(Ee(t))}; limitType=${t.limitType})`;
    }

    /** Returns whether `doc` matches the constraints of `query`. */ function Pe(t, e) {
        return e.isFoundDocument() && function(t, e) {
            const n = e.key.path;
            return null !== t.collectionGroup ? e.key.hasCollectionId(t.collectionGroup) && t.path.isPrefixOf(n) : Pt.isDocumentKey(t.path) ? t.path.isEqual(n) : t.path.isImmediateParentOf(n);
        }
        /**
     * A document must have a value for every ordering clause in order to show up
     * in the results.
     */ (t, e) && function(t, e) {
            for (const n of t.explicitOrderBy) 
            // order by key always matches
            if (!n.field.isKeyField() && null === e.data.field(n.field)) return !1;
            return !0;
        }(t, e) && function(t, e) {
            for (const n of t.filters) if (!n.matches(e)) return !1;
            return !0;
        }
        /** Makes sure a document is within the bounds, if provided. */ (t, e) && function(t, e) {
            if (t.startAt && !ue(t.startAt, pe(t), e)) return !1;
            if (t.endAt && ue(t.endAt, pe(t), e)) return !1;
            return !0;
        }
        /**
     * Returns a new comparator function that can be used to compare two documents
     * based on the Query's ordering constraint.
     */ (t, e);
    }

    function be(t) {
        return (e, n) => {
            let s = !1;
            for (const i of pe(t)) {
                const t = ve(i, e, n);
                if (0 !== t) return t;
                s = s || i.field.isKeyField();
            }
            return 0;
        };
    }

    function ve(t, e, n) {
        const s = t.field.isKeyField() ? Pt.comparator(e.key, n.key) : function(t, e, n) {
            const s = e.data.field(t), i = n.data.field(t);
            return null !== s && null !== i ? St(s, i) : M$1();
        }(t.field, e, n);
        switch (t.dir) {
          case "asc" /* ASCENDING */ :
            return s;

          case "desc" /* DESCENDING */ :
            return -1 * s;

          default:
            return M$1();
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Returns an DoubleValue for `value` that is encoded based the serializer's
     * `useProto3Json` setting.
     */ function Ve(t, e) {
        if (t.D) {
            if (isNaN(e)) return {
                doubleValue: "NaN"
            };
            if (e === 1 / 0) return {
                doubleValue: "Infinity"
            };
            if (e === -1 / 0) return {
                doubleValue: "-Infinity"
            };
        }
        return {
            doubleValue: At(e) ? "-0" : e
        };
    }

    /**
     * Returns an IntegerValue for `value`.
     */ function Se(t) {
        return {
            integerValue: "" + t
        };
    }

    /**
     * Returns a value for a number that's appropriate to put into a proto.
     * The return value is an IntegerValue if it can safely represent the value,
     * otherwise a DoubleValue is returned.
     */ function De(t, e) {
        return Rt(e) ? Se(e) : Ve(t, e);
    }

    /**
     * @license
     * Copyright 2018 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /** Used to represent a field transform on a mutation. */ class Ce {
        constructor() {
            // Make sure that the structural type of `TransformOperation` is unique.
            // See https://github.com/microsoft/TypeScript/issues/5451
            this._ = void 0;
        }
    }

    /**
     * Computes the local transform result against the provided `previousValue`,
     * optionally using the provided localWriteTime.
     */ function Ne(t, e, n) {
        return t instanceof $e ? function(t, e) {
            const n = {
                fields: {
                    __type__: {
                        stringValue: "server_timestamp"
                    },
                    __local_write_time__: {
                        timestampValue: {
                            seconds: t.seconds,
                            nanos: t.nanoseconds
                        }
                    }
                }
            };
            return e && (n.fields.__previous_value__ = e), {
                mapValue: n
            };
        }(n, e) : t instanceof Oe ? Fe(t, e) : t instanceof Me ? Le(t, e) : function(t, e) {
            // PORTING NOTE: Since JavaScript's integer arithmetic is limited to 53 bit
            // precision and resolves overflows by reducing precision, we do not
            // manually cap overflows at 2^63.
            const n = ke(t, e), s = Ue(n) + Ue(t.C);
            return kt(n) && kt(t.C) ? Se(s) : Ve(t.N, s);
        }(t, e);
    }

    /**
     * Computes a final transform result after the transform has been acknowledged
     * by the server, potentially using the server-provided transformResult.
     */ function xe(t, e, n) {
        // The server just sends null as the transform result for array operations,
        // so we have to calculate a result the same as we do for local
        // applications.
        return t instanceof Oe ? Fe(t, e) : t instanceof Me ? Le(t, e) : n;
    }

    /**
     * If this transform operation is not idempotent, returns the base value to
     * persist for this transform. If a base value is returned, the transform
     * operation is always applied to this base value, even if document has
     * already been updated.
     *
     * Base values provide consistent behavior for non-idempotent transforms and
     * allow us to return the same latency-compensated value even if the backend
     * has already applied the transform operation. The base value is null for
     * idempotent transforms, as they can be re-played even if the backend has
     * already applied them.
     *
     * @returns a base value to store along with the mutation, or null for
     * idempotent transforms.
     */ function ke(t, e) {
        return t instanceof Be ? kt(n = e) || function(t) {
            return !!t && "doubleValue" in t;
        }
        /** Returns true if `value` is either an IntegerValue or a DoubleValue. */ (n) ? e : {
            integerValue: 0
        } : null;
        var n;
    }

    /** Transforms a value into a server-generated timestamp. */
    class $e extends Ce {}

    /** Transforms an array value via a union operation. */ class Oe extends Ce {
        constructor(t) {
            super(), this.elements = t;
        }
    }

    function Fe(t, e) {
        const n = qe(e);
        for (const e of t.elements) n.some((t => vt(t, e))) || n.push(e);
        return {
            arrayValue: {
                values: n
            }
        };
    }

    /** Transforms an array value via a remove operation. */ class Me extends Ce {
        constructor(t) {
            super(), this.elements = t;
        }
    }

    function Le(t, e) {
        let n = qe(e);
        for (const e of t.elements) n = n.filter((t => !vt(t, e)));
        return {
            arrayValue: {
                values: n
            }
        };
    }

    /**
     * Implements the backend semantics for locally computed NUMERIC_ADD (increment)
     * transforms. Converts all field values to integers or doubles, but unlike the
     * backend does not cap integer values at 2^63. Instead, JavaScript number
     * arithmetic is used and precision loss can occur for values greater than 2^53.
     */ class Be extends Ce {
        constructor(t, e) {
            super(), this.N = t, this.C = e;
        }
    }

    function Ue(t) {
        return gt(t.integerValue || t.doubleValue);
    }

    function qe(t) {
        return $t(t) && t.arrayValue.values ? t.arrayValue.values.slice() : [];
    }

    function je(t, e) {
        return t.field.isEqual(e.field) && function(t, e) {
            return t instanceof Oe && e instanceof Oe || t instanceof Me && e instanceof Me ? et(t.elements, e.elements, vt) : t instanceof Be && e instanceof Be ? vt(t.C, e.C) : t instanceof $e && e instanceof $e;
        }(t.transform, e.transform);
    }

    /** The result of successfully applying a mutation to the backend. */
    class Qe {
        constructor(
        /**
         * The version at which the mutation was committed:
         *
         * - For most operations, this is the updateTime in the WriteResult.
         * - For deletes, the commitTime of the WriteResponse (because deletes are
         *   not stored and have no updateTime).
         *
         * Note that these versions can be different: No-op writes will not change
         * the updateTime even though the commitTime advances.
         */
        t, 
        /**
         * The resulting fields returned from the backend after a mutation
         * containing field transforms has been committed. Contains one FieldValue
         * for each FieldTransform that was in the mutation.
         *
         * Will be empty if the mutation did not contain any field transforms.
         */
        e) {
            this.version = t, this.transformResults = e;
        }
    }

    /**
     * Encodes a precondition for a mutation. This follows the model that the
     * backend accepts with the special case of an explicit "empty" precondition
     * (meaning no precondition).
     */ class We {
        constructor(t, e) {
            this.updateTime = t, this.exists = e;
        }
        /** Creates a new empty Precondition. */    static none() {
            return new We;
        }
        /** Creates a new Precondition with an exists flag. */    static exists(t) {
            return new We(void 0, t);
        }
        /** Creates a new Precondition based on a version a document exists at. */    static updateTime(t) {
            return new We(t);
        }
        /** Returns whether this Precondition is empty. */    get isNone() {
            return void 0 === this.updateTime && void 0 === this.exists;
        }
        isEqual(t) {
            return this.exists === t.exists && (this.updateTime ? !!t.updateTime && this.updateTime.isEqual(t.updateTime) : !t.updateTime);
        }
    }

    /** Returns true if the preconditions is valid for the given document. */ function Ge(t, e) {
        return void 0 !== t.updateTime ? e.isFoundDocument() && e.version.isEqual(t.updateTime) : void 0 === t.exists || t.exists === e.isFoundDocument();
    }

    /**
     * A mutation describes a self-contained change to a document. Mutations can
     * create, replace, delete, and update subsets of documents.
     *
     * Mutations not only act on the value of the document but also its version.
     *
     * For local mutations (mutations that haven't been committed yet), we preserve
     * the existing version for Set and Patch mutations. For Delete mutations, we
     * reset the version to 0.
     *
     * Here's the expected transition table.
     *
     * MUTATION           APPLIED TO            RESULTS IN
     *
     * SetMutation        Document(v3)          Document(v3)
     * SetMutation        NoDocument(v3)        Document(v0)
     * SetMutation        InvalidDocument(v0)   Document(v0)
     * PatchMutation      Document(v3)          Document(v3)
     * PatchMutation      NoDocument(v3)        NoDocument(v3)
     * PatchMutation      InvalidDocument(v0)   UnknownDocument(v3)
     * DeleteMutation     Document(v3)          NoDocument(v0)
     * DeleteMutation     NoDocument(v3)        NoDocument(v0)
     * DeleteMutation     InvalidDocument(v0)   NoDocument(v0)
     *
     * For acknowledged mutations, we use the updateTime of the WriteResponse as
     * the resulting version for Set and Patch mutations. As deletes have no
     * explicit update time, we use the commitTime of the WriteResponse for
     * Delete mutations.
     *
     * If a mutation is acknowledged by the backend but fails the precondition check
     * locally, we transition to an `UnknownDocument` and rely on Watch to send us
     * the updated version.
     *
     * Field transforms are used only with Patch and Set Mutations. We use the
     * `updateTransforms` message to store transforms, rather than the `transforms`s
     * messages.
     *
     * ## Subclassing Notes
     *
     * Every type of mutation needs to implement its own applyToRemoteDocument() and
     * applyToLocalView() to implement the actual behavior of applying the mutation
     * to some source document (see `applySetMutationToRemoteDocument()` for an
     * example).
     */ class ze {}

    /**
     * Applies this mutation to the given document for the purposes of computing a
     * new remote document. If the input document doesn't match the expected state
     * (e.g. it is invalid or outdated), the document type may transition to
     * unknown.
     *
     * @param mutation - The mutation to apply.
     * @param document - The document to mutate. The input document can be an
     *     invalid document if the client has no knowledge of the pre-mutation state
     *     of the document.
     * @param mutationResult - The result of applying the mutation from the backend.
     */ function He(t, e, n) {
        t instanceof tn ? function(t, e, n) {
            // Unlike applySetMutationToLocalView, if we're applying a mutation to a
            // remote document the server has accepted the mutation so the precondition
            // must have held.
            const s = t.value.clone(), i = sn(t.fieldTransforms, e, n.transformResults);
            s.setAll(i), e.convertToFoundDocument(n.version, s).setHasCommittedMutations();
        }(t, e, n) : t instanceof en ? function(t, e, n) {
            if (!Ge(t.precondition, e)) 
            // Since the mutation was not rejected, we know that the precondition
            // matched on the backend. We therefore must not have the expected version
            // of the document in our cache and convert to an UnknownDocument with a
            // known updateTime.
            return void e.convertToUnknownDocument(n.version);
            const s = sn(t.fieldTransforms, e, n.transformResults), i = e.data;
            i.setAll(nn(t)), i.setAll(s), e.convertToFoundDocument(n.version, i).setHasCommittedMutations();
        }(t, e, n) : function(t, e, n) {
            // Unlike applyToLocalView, if we're applying a mutation to a remote
            // document the server has accepted the mutation so the precondition must
            // have held.
            e.convertToNoDocument(n.version).setHasCommittedMutations();
        }(0, e, n);
    }

    /**
     * Applies this mutation to the given document for the purposes of computing
     * the new local view of a document. If the input document doesn't match the
     * expected state, the document is not modified.
     *
     * @param mutation - The mutation to apply.
     * @param document - The document to mutate. The input document can be an
     *     invalid document if the client has no knowledge of the pre-mutation state
     *     of the document.
     * @param localWriteTime - A timestamp indicating the local write time of the
     *     batch this mutation is a part of.
     */ function Je(t, e, n) {
        t instanceof tn ? function(t, e, n) {
            if (!Ge(t.precondition, e)) 
            // The mutation failed to apply (e.g. a document ID created with add()
            // caused a name collision).
            return;
            const s = t.value.clone(), i = rn(t.fieldTransforms, n, e);
            s.setAll(i), e.convertToFoundDocument(Ze(e), s).setHasLocalMutations();
        }
        /**
     * A mutation that modifies fields of the document at the given key with the
     * given values. The values are applied through a field mask:
     *
     *  * When a field is in both the mask and the values, the corresponding field
     *    is updated.
     *  * When a field is in neither the mask nor the values, the corresponding
     *    field is unmodified.
     *  * When a field is in the mask but not in the values, the corresponding field
     *    is deleted.
     *  * When a field is not in the mask but is in the values, the values map is
     *    ignored.
     */ (t, e, n) : t instanceof en ? function(t, e, n) {
            if (!Ge(t.precondition, e)) return;
            const s = rn(t.fieldTransforms, n, e), i = e.data;
            i.setAll(nn(t)), i.setAll(s), e.convertToFoundDocument(Ze(e), i).setHasLocalMutations();
        }
        /**
     * Returns a FieldPath/Value map with the content of the PatchMutation.
     */ (t, e, n) : function(t, e) {
            Ge(t.precondition, e) && 
            // We don't call `setHasLocalMutations()` since we want to be backwards
            // compatible with the existing SDK behavior.
            e.convertToNoDocument(it.min());
        }
        /**
     * A mutation that verifies the existence of the document at the given key with
     * the provided precondition.
     *
     * The `verify` operation is only used in Transactions, and this class serves
     * primarily to facilitate serialization into protos.
     */ (t, e);
    }

    /**
     * If this mutation is not idempotent, returns the base value to persist with
     * this mutation. If a base value is returned, the mutation is always applied
     * to this base value, even if document has already been updated.
     *
     * The base value is a sparse object that consists of only the document
     * fields for which this mutation contains a non-idempotent transformation
     * (e.g. a numeric increment). The provided value guarantees consistent
     * behavior for non-idempotent transforms and allow us to return the same
     * latency-compensated value even if the backend has already applied the
     * mutation. The base value is null for idempotent mutations, as they can be
     * re-played even if the backend has already applied them.
     *
     * @returns a base value to store along with the mutation, or null for
     * idempotent mutations.
     */ function Ye(t, e) {
        let n = null;
        for (const s of t.fieldTransforms) {
            const t = e.data.field(s.field), i = ke(s.transform, t || null);
            null != i && (null == n && (n = Bt.empty()), n.set(s.field, i));
        }
        return n || null;
    }

    function Xe(t, e) {
        return t.type === e.type && (!!t.key.isEqual(e.key) && (!!t.precondition.isEqual(e.precondition) && (!!function(t, e) {
            return void 0 === t && void 0 === e || !(!t || !e) && et(t, e, ((t, e) => je(t, e)));
        }(t.fieldTransforms, e.fieldTransforms) && (0 /* Set */ === t.type ? t.value.isEqual(e.value) : 1 /* Patch */ !== t.type || t.data.isEqual(e.data) && t.fieldMask.isEqual(e.fieldMask)))));
    }

    /**
     * Returns the version from the given document for use as the result of a
     * mutation. Mutations are defined to return the version of the base document
     * only if it is an existing document. Deleted and unknown documents have a
     * post-mutation version of SnapshotVersion.min().
     */ function Ze(t) {
        return t.isFoundDocument() ? t.version : it.min();
    }

    /**
     * A mutation that creates or replaces the document at the given key with the
     * object value contents.
     */ class tn extends ze {
        constructor(t, e, n, s = []) {
            super(), this.key = t, this.value = e, this.precondition = n, this.fieldTransforms = s, 
            this.type = 0 /* Set */;
        }
    }

    class en extends ze {
        constructor(t, e, n, s, i = []) {
            super(), this.key = t, this.data = e, this.fieldMask = n, this.precondition = s, 
            this.fieldTransforms = i, this.type = 1 /* Patch */;
        }
    }

    function nn(t) {
        const e = new Map;
        return t.fieldMask.fields.forEach((n => {
            if (!n.isEmpty()) {
                const s = t.data.field(n);
                e.set(n, s);
            }
        })), e;
    }

    /**
     * Creates a list of "transform results" (a transform result is a field value
     * representing the result of applying a transform) for use after a mutation
     * containing transforms has been acknowledged by the server.
     *
     * @param fieldTransforms - The field transforms to apply the result to.
     * @param mutableDocument - The current state of the document after applying all
     * previous mutations.
     * @param serverTransformResults - The transform results received by the server.
     * @returns The transform results list.
     */ function sn(t, e, n) {
        const s = new Map;
        L$1(t.length === n.length);
        for (let i = 0; i < n.length; i++) {
            const r = t[i], o = r.transform, a = e.data.field(r.field);
            s.set(r.field, xe(o, a, n[i]));
        }
        return s;
    }

    /**
     * Creates a list of "transform results" (a transform result is a field value
     * representing the result of applying a transform) for use when applying a
     * transform locally.
     *
     * @param fieldTransforms - The field transforms to apply the result to.
     * @param localWriteTime - The local time of the mutation (used to
     *     generate ServerTimestampValues).
     * @param mutableDocument - The current state of the document after applying all
     *     previous mutations.
     * @returns The transform results list.
     */ function rn(t, e, n) {
        const s = new Map;
        for (const i of t) {
            const t = i.transform, r = n.data.field(i.field);
            s.set(i.field, Ne(t, r, e));
        }
        return s;
    }

    /** A mutation that deletes the document at the given key. */ class on extends ze {
        constructor(t, e) {
            super(), this.key = t, this.precondition = e, this.type = 2 /* Delete */ , this.fieldTransforms = [];
        }
    }

    class an extends ze {
        constructor(t, e) {
            super(), this.key = t, this.precondition = e, this.type = 3 /* Verify */ , this.fieldTransforms = [];
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class cn {
        // TODO(b/33078163): just use simplest form of existence filter for now
        constructor(t) {
            this.count = t;
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Error Codes describing the different ways GRPC can fail. These are copied
     * directly from GRPC's sources here:
     *
     * https://github.com/grpc/grpc/blob/bceec94ea4fc5f0085d81235d8e1c06798dc341a/include/grpc%2B%2B/impl/codegen/status_code_enum.h
     *
     * Important! The names of these identifiers matter because the string forms
     * are used for reverse lookups from the webchannel stream. Do NOT change the
     * names of these identifiers or change this into a const enum.
     */ var un, hn;

    /**
     * Determines whether an error code represents a permanent error when received
     * in response to a non-write operation.
     *
     * See isPermanentWriteError for classifying write errors.
     */
    function ln(t) {
        switch (t) {
          case q$1.OK:
            return M$1();

          case q$1.CANCELLED:
          case q$1.UNKNOWN:
          case q$1.DEADLINE_EXCEEDED:
          case q$1.RESOURCE_EXHAUSTED:
          case q$1.INTERNAL:
          case q$1.UNAVAILABLE:
     // Unauthenticated means something went wrong with our token and we need
            // to retry with new credentials which will happen automatically.
                  case q$1.UNAUTHENTICATED:
            return !1;

          case q$1.INVALID_ARGUMENT:
          case q$1.NOT_FOUND:
          case q$1.ALREADY_EXISTS:
          case q$1.PERMISSION_DENIED:
          case q$1.FAILED_PRECONDITION:
     // Aborted might be retried in some scenarios, but that is dependant on
            // the context and should handled individually by the calling code.
            // See https://cloud.google.com/apis/design/errors.
                  case q$1.ABORTED:
          case q$1.OUT_OF_RANGE:
          case q$1.UNIMPLEMENTED:
          case q$1.DATA_LOSS:
            return !0;

          default:
            return M$1();
        }
    }

    /**
     * Determines whether an error code represents a permanent error when received
     * in response to a write operation.
     *
     * Write operations must be handled specially because as of b/119437764, ABORTED
     * errors on the write stream should be retried too (even though ABORTED errors
     * are not generally retryable).
     *
     * Note that during the initial handshake on the write stream an ABORTED error
     * signals that we should discard our stream token (i.e. it is permanent). This
     * means a handshake error should be classified with isPermanentError, above.
     */
    /**
     * Maps an error Code from GRPC status code number, like 0, 1, or 14. These
     * are not the same as HTTP status codes.
     *
     * @returns The Code equivalent to the given GRPC status code. Fails if there
     *     is no match.
     */
    function fn(t) {
        if (void 0 === t) 
        // This shouldn't normally happen, but in certain error cases (like trying
        // to send invalid proto messages) we may get an error with no GRPC code.
        return $("GRPC error has no .code"), q$1.UNKNOWN;
        switch (t) {
          case un.OK:
            return q$1.OK;

          case un.CANCELLED:
            return q$1.CANCELLED;

          case un.UNKNOWN:
            return q$1.UNKNOWN;

          case un.DEADLINE_EXCEEDED:
            return q$1.DEADLINE_EXCEEDED;

          case un.RESOURCE_EXHAUSTED:
            return q$1.RESOURCE_EXHAUSTED;

          case un.INTERNAL:
            return q$1.INTERNAL;

          case un.UNAVAILABLE:
            return q$1.UNAVAILABLE;

          case un.UNAUTHENTICATED:
            return q$1.UNAUTHENTICATED;

          case un.INVALID_ARGUMENT:
            return q$1.INVALID_ARGUMENT;

          case un.NOT_FOUND:
            return q$1.NOT_FOUND;

          case un.ALREADY_EXISTS:
            return q$1.ALREADY_EXISTS;

          case un.PERMISSION_DENIED:
            return q$1.PERMISSION_DENIED;

          case un.FAILED_PRECONDITION:
            return q$1.FAILED_PRECONDITION;

          case un.ABORTED:
            return q$1.ABORTED;

          case un.OUT_OF_RANGE:
            return q$1.OUT_OF_RANGE;

          case un.UNIMPLEMENTED:
            return q$1.UNIMPLEMENTED;

          case un.DATA_LOSS:
            return q$1.DATA_LOSS;

          default:
            return M$1();
        }
    }

    /**
     * Converts an HTTP response's error status to the equivalent error code.
     *
     * @param status - An HTTP error response status ("FAILED_PRECONDITION",
     * "UNKNOWN", etc.)
     * @returns The equivalent Code. Non-matching responses are mapped to
     *     Code.UNKNOWN.
     */ (hn = un || (un = {}))[hn.OK = 0] = "OK", hn[hn.CANCELLED = 1] = "CANCELLED", 
    hn[hn.UNKNOWN = 2] = "UNKNOWN", hn[hn.INVALID_ARGUMENT = 3] = "INVALID_ARGUMENT", 
    hn[hn.DEADLINE_EXCEEDED = 4] = "DEADLINE_EXCEEDED", hn[hn.NOT_FOUND = 5] = "NOT_FOUND", 
    hn[hn.ALREADY_EXISTS = 6] = "ALREADY_EXISTS", hn[hn.PERMISSION_DENIED = 7] = "PERMISSION_DENIED", 
    hn[hn.UNAUTHENTICATED = 16] = "UNAUTHENTICATED", hn[hn.RESOURCE_EXHAUSTED = 8] = "RESOURCE_EXHAUSTED", 
    hn[hn.FAILED_PRECONDITION = 9] = "FAILED_PRECONDITION", hn[hn.ABORTED = 10] = "ABORTED", 
    hn[hn.OUT_OF_RANGE = 11] = "OUT_OF_RANGE", hn[hn.UNIMPLEMENTED = 12] = "UNIMPLEMENTED", 
    hn[hn.INTERNAL = 13] = "INTERNAL", hn[hn.UNAVAILABLE = 14] = "UNAVAILABLE", hn[hn.DATA_LOSS = 15] = "DATA_LOSS";

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    // An immutable sorted map implementation, based on a Left-leaning Red-Black
    // tree.
    class dn {
        constructor(t, e) {
            this.comparator = t, this.root = e || _n.EMPTY;
        }
        // Returns a copy of the map, with the specified key/value added or replaced.
        insert(t, e) {
            return new dn(this.comparator, this.root.insert(t, e, this.comparator).copy(null, null, _n.BLACK, null, null));
        }
        // Returns a copy of the map, with the specified key removed.
        remove(t) {
            return new dn(this.comparator, this.root.remove(t, this.comparator).copy(null, null, _n.BLACK, null, null));
        }
        // Returns the value of the node with the given key, or null.
        get(t) {
            let e = this.root;
            for (;!e.isEmpty(); ) {
                const n = this.comparator(t, e.key);
                if (0 === n) return e.value;
                n < 0 ? e = e.left : n > 0 && (e = e.right);
            }
            return null;
        }
        // Returns the index of the element in this sorted map, or -1 if it doesn't
        // exist.
        indexOf(t) {
            // Number of nodes that were pruned when descending right
            let e = 0, n = this.root;
            for (;!n.isEmpty(); ) {
                const s = this.comparator(t, n.key);
                if (0 === s) return e + n.left.size;
                s < 0 ? n = n.left : (
                // Count all nodes left of the node plus the node itself
                e += n.left.size + 1, n = n.right);
            }
            // Node not found
                    return -1;
        }
        isEmpty() {
            return this.root.isEmpty();
        }
        // Returns the total number of nodes in the map.
        get size() {
            return this.root.size;
        }
        // Returns the minimum key in the map.
        minKey() {
            return this.root.minKey();
        }
        // Returns the maximum key in the map.
        maxKey() {
            return this.root.maxKey();
        }
        // Traverses the map in key order and calls the specified action function
        // for each key/value pair. If action returns true, traversal is aborted.
        // Returns the first truthy value returned by action, or the last falsey
        // value returned by action.
        inorderTraversal(t) {
            return this.root.inorderTraversal(t);
        }
        forEach(t) {
            this.inorderTraversal(((e, n) => (t(e, n), !1)));
        }
        toString() {
            const t = [];
            return this.inorderTraversal(((e, n) => (t.push(`${e}:${n}`), !1))), `{${t.join(", ")}}`;
        }
        // Traverses the map in reverse key order and calls the specified action
        // function for each key/value pair. If action returns true, traversal is
        // aborted.
        // Returns the first truthy value returned by action, or the last falsey
        // value returned by action.
        reverseTraversal(t) {
            return this.root.reverseTraversal(t);
        }
        // Returns an iterator over the SortedMap.
        getIterator() {
            return new wn(this.root, null, this.comparator, !1);
        }
        getIteratorFrom(t) {
            return new wn(this.root, t, this.comparator, !1);
        }
        getReverseIterator() {
            return new wn(this.root, null, this.comparator, !0);
        }
        getReverseIteratorFrom(t) {
            return new wn(this.root, t, this.comparator, !0);
        }
    }

     // end SortedMap
    // An iterator over an LLRBNode.
    class wn {
        constructor(t, e, n, s) {
            this.isReverse = s, this.nodeStack = [];
            let i = 1;
            for (;!t.isEmpty(); ) if (i = e ? n(t.key, e) : 1, 
            // flip the comparison if we're going in reverse
            s && (i *= -1), i < 0) 
            // This node is less than our start key. ignore it
            t = this.isReverse ? t.left : t.right; else {
                if (0 === i) {
                    // This node is exactly equal to our start key. Push it on the stack,
                    // but stop iterating;
                    this.nodeStack.push(t);
                    break;
                }
                // This node is greater than our start key, add it to the stack and move
                // to the next one
                this.nodeStack.push(t), t = this.isReverse ? t.right : t.left;
            }
        }
        getNext() {
            let t = this.nodeStack.pop();
            const e = {
                key: t.key,
                value: t.value
            };
            if (this.isReverse) for (t = t.left; !t.isEmpty(); ) this.nodeStack.push(t), t = t.right; else for (t = t.right; !t.isEmpty(); ) this.nodeStack.push(t), 
            t = t.left;
            return e;
        }
        hasNext() {
            return this.nodeStack.length > 0;
        }
        peek() {
            if (0 === this.nodeStack.length) return null;
            const t = this.nodeStack[this.nodeStack.length - 1];
            return {
                key: t.key,
                value: t.value
            };
        }
    }

     // end SortedMapIterator
    // Represents a node in a Left-leaning Red-Black tree.
    class _n {
        constructor(t, e, n, s, i) {
            this.key = t, this.value = e, this.color = null != n ? n : _n.RED, this.left = null != s ? s : _n.EMPTY, 
            this.right = null != i ? i : _n.EMPTY, this.size = this.left.size + 1 + this.right.size;
        }
        // Returns a copy of the current node, optionally replacing pieces of it.
        copy(t, e, n, s, i) {
            return new _n(null != t ? t : this.key, null != e ? e : this.value, null != n ? n : this.color, null != s ? s : this.left, null != i ? i : this.right);
        }
        isEmpty() {
            return !1;
        }
        // Traverses the tree in key order and calls the specified action function
        // for each node. If action returns true, traversal is aborted.
        // Returns the first truthy value returned by action, or the last falsey
        // value returned by action.
        inorderTraversal(t) {
            return this.left.inorderTraversal(t) || t(this.key, this.value) || this.right.inorderTraversal(t);
        }
        // Traverses the tree in reverse key order and calls the specified action
        // function for each node. If action returns true, traversal is aborted.
        // Returns the first truthy value returned by action, or the last falsey
        // value returned by action.
        reverseTraversal(t) {
            return this.right.reverseTraversal(t) || t(this.key, this.value) || this.left.reverseTraversal(t);
        }
        // Returns the minimum node in the tree.
        min() {
            return this.left.isEmpty() ? this : this.left.min();
        }
        // Returns the maximum key in the tree.
        minKey() {
            return this.min().key;
        }
        // Returns the maximum key in the tree.
        maxKey() {
            return this.right.isEmpty() ? this.key : this.right.maxKey();
        }
        // Returns new tree, with the key/value added.
        insert(t, e, n) {
            let s = this;
            const i = n(t, s.key);
            return s = i < 0 ? s.copy(null, null, null, s.left.insert(t, e, n), null) : 0 === i ? s.copy(null, e, null, null, null) : s.copy(null, null, null, null, s.right.insert(t, e, n)), 
            s.fixUp();
        }
        removeMin() {
            if (this.left.isEmpty()) return _n.EMPTY;
            let t = this;
            return t.left.isRed() || t.left.left.isRed() || (t = t.moveRedLeft()), t = t.copy(null, null, null, t.left.removeMin(), null), 
            t.fixUp();
        }
        // Returns new tree, with the specified item removed.
        remove(t, e) {
            let n, s = this;
            if (e(t, s.key) < 0) s.left.isEmpty() || s.left.isRed() || s.left.left.isRed() || (s = s.moveRedLeft()), 
            s = s.copy(null, null, null, s.left.remove(t, e), null); else {
                if (s.left.isRed() && (s = s.rotateRight()), s.right.isEmpty() || s.right.isRed() || s.right.left.isRed() || (s = s.moveRedRight()), 
                0 === e(t, s.key)) {
                    if (s.right.isEmpty()) return _n.EMPTY;
                    n = s.right.min(), s = s.copy(n.key, n.value, null, null, s.right.removeMin());
                }
                s = s.copy(null, null, null, null, s.right.remove(t, e));
            }
            return s.fixUp();
        }
        isRed() {
            return this.color;
        }
        // Returns new tree after performing any needed rotations.
        fixUp() {
            let t = this;
            return t.right.isRed() && !t.left.isRed() && (t = t.rotateLeft()), t.left.isRed() && t.left.left.isRed() && (t = t.rotateRight()), 
            t.left.isRed() && t.right.isRed() && (t = t.colorFlip()), t;
        }
        moveRedLeft() {
            let t = this.colorFlip();
            return t.right.left.isRed() && (t = t.copy(null, null, null, null, t.right.rotateRight()), 
            t = t.rotateLeft(), t = t.colorFlip()), t;
        }
        moveRedRight() {
            let t = this.colorFlip();
            return t.left.left.isRed() && (t = t.rotateRight(), t = t.colorFlip()), t;
        }
        rotateLeft() {
            const t = this.copy(null, null, _n.RED, null, this.right.left);
            return this.right.copy(null, null, this.color, t, null);
        }
        rotateRight() {
            const t = this.copy(null, null, _n.RED, this.left.right, null);
            return this.left.copy(null, null, this.color, null, t);
        }
        colorFlip() {
            const t = this.left.copy(null, null, !this.left.color, null, null), e = this.right.copy(null, null, !this.right.color, null, null);
            return this.copy(null, null, !this.color, t, e);
        }
        // For testing.
        checkMaxDepth() {
            const t = this.check();
            return Math.pow(2, t) <= this.size + 1;
        }
        // In a balanced RB tree, the black-depth (number of black nodes) from root to
        // leaves is equal on both sides.  This function verifies that or asserts.
        check() {
            if (this.isRed() && this.left.isRed()) throw M$1();
            if (this.right.isRed()) throw M$1();
            const t = this.left.check();
            if (t !== this.right.check()) throw M$1();
            return t + (this.isRed() ? 0 : 1);
        }
    }

     // end LLRBNode
    // Empty node is shared between all LLRB trees.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _n.EMPTY = null, _n.RED = !0, _n.BLACK = !1;

    // end LLRBEmptyNode
    _n.EMPTY = new 
    // Represents an empty node (a leaf node in the Red-Black Tree).
    class {
        constructor() {
            this.size = 0;
        }
        get key() {
            throw M$1();
        }
        get value() {
            throw M$1();
        }
        get color() {
            throw M$1();
        }
        get left() {
            throw M$1();
        }
        get right() {
            throw M$1();
        }
        // Returns a copy of the current node.
        copy(t, e, n, s, i) {
            return this;
        }
        // Returns a copy of the tree, with the specified key/value added.
        insert(t, e, n) {
            return new _n(t, e);
        }
        // Returns a copy of the tree, with the specified key removed.
        remove(t, e) {
            return this;
        }
        isEmpty() {
            return !0;
        }
        inorderTraversal(t) {
            return !1;
        }
        reverseTraversal(t) {
            return !1;
        }
        minKey() {
            return null;
        }
        maxKey() {
            return null;
        }
        isRed() {
            return !1;
        }
        // For testing.
        checkMaxDepth() {
            return !0;
        }
        check() {
            return 0;
        }
    };

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * SortedSet is an immutable (copy-on-write) collection that holds elements
     * in order specified by the provided comparator.
     *
     * NOTE: if provided comparator returns 0 for two elements, we consider them to
     * be equal!
     */
    class mn {
        constructor(t) {
            this.comparator = t, this.data = new dn(this.comparator);
        }
        has(t) {
            return null !== this.data.get(t);
        }
        first() {
            return this.data.minKey();
        }
        last() {
            return this.data.maxKey();
        }
        get size() {
            return this.data.size;
        }
        indexOf(t) {
            return this.data.indexOf(t);
        }
        /** Iterates elements in order defined by "comparator" */    forEach(t) {
            this.data.inorderTraversal(((e, n) => (t(e), !1)));
        }
        /** Iterates over `elem`s such that: range[0] &lt;= elem &lt; range[1]. */    forEachInRange(t, e) {
            const n = this.data.getIteratorFrom(t[0]);
            for (;n.hasNext(); ) {
                const s = n.getNext();
                if (this.comparator(s.key, t[1]) >= 0) return;
                e(s.key);
            }
        }
        /**
         * Iterates over `elem`s such that: start &lt;= elem until false is returned.
         */    forEachWhile(t, e) {
            let n;
            for (n = void 0 !== e ? this.data.getIteratorFrom(e) : this.data.getIterator(); n.hasNext(); ) {
                if (!t(n.getNext().key)) return;
            }
        }
        /** Finds the least element greater than or equal to `elem`. */    firstAfterOrEqual(t) {
            const e = this.data.getIteratorFrom(t);
            return e.hasNext() ? e.getNext().key : null;
        }
        getIterator() {
            return new gn(this.data.getIterator());
        }
        getIteratorFrom(t) {
            return new gn(this.data.getIteratorFrom(t));
        }
        /** Inserts or updates an element */    add(t) {
            return this.copy(this.data.remove(t).insert(t, !0));
        }
        /** Deletes an element */    delete(t) {
            return this.has(t) ? this.copy(this.data.remove(t)) : this;
        }
        isEmpty() {
            return this.data.isEmpty();
        }
        unionWith(t) {
            let e = this;
            // Make sure `result` always refers to the larger one of the two sets.
                    return e.size < t.size && (e = t, t = this), t.forEach((t => {
                e = e.add(t);
            })), e;
        }
        isEqual(t) {
            if (!(t instanceof mn)) return !1;
            if (this.size !== t.size) return !1;
            const e = this.data.getIterator(), n = t.data.getIterator();
            for (;e.hasNext(); ) {
                const t = e.getNext().key, s = n.getNext().key;
                if (0 !== this.comparator(t, s)) return !1;
            }
            return !0;
        }
        toArray() {
            const t = [];
            return this.forEach((e => {
                t.push(e);
            })), t;
        }
        toString() {
            const t = [];
            return this.forEach((e => t.push(e))), "SortedSet(" + t.toString() + ")";
        }
        copy(t) {
            const e = new mn(this.comparator);
            return e.data = t, e;
        }
    }

    class gn {
        constructor(t) {
            this.iter = t;
        }
        getNext() {
            return this.iter.getNext().key;
        }
        hasNext() {
            return this.iter.hasNext();
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ const yn = new dn(Pt.comparator);

    function pn() {
        return yn;
    }

    const En = new dn(Pt.comparator);

    function Tn() {
        return En;
    }

    const In = new dn(Pt.comparator);

    function An() {
        return In;
    }

    const Rn = new mn(Pt.comparator);

    function Pn(...t) {
        let e = Rn;
        for (const n of t) e = e.add(n);
        return e;
    }

    const bn = new mn(tt);

    function vn() {
        return bn;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * An event from the RemoteStore. It is split into targetChanges (changes to the
     * state or the set of documents in our watched targets) and documentUpdates
     * (changes to the actual documents).
     */ class Vn {
        constructor(
        /**
         * The snapshot version this event brings us up to, or MIN if not set.
         */
        t, 
        /**
         * A map from target to changes to the target. See TargetChange.
         */
        e, 
        /**
         * A set of targets that is known to be inconsistent. Listens for these
         * targets should be re-established without resume tokens.
         */
        n, 
        /**
         * A set of which documents have changed or been deleted, along with the
         * doc's new values (if not deleted).
         */
        s, 
        /**
         * A set of which document updates are due only to limbo resolution targets.
         */
        i) {
            this.snapshotVersion = t, this.targetChanges = e, this.targetMismatches = n, this.documentUpdates = s, 
            this.resolvedLimboDocuments = i;
        }
        /**
         * HACK: Views require RemoteEvents in order to determine whether the view is
         * CURRENT, but secondary tabs don't receive remote events. So this method is
         * used to create a synthesized RemoteEvent that can be used to apply a
         * CURRENT status change to a View, for queries executed in a different tab.
         */
        // PORTING NOTE: Multi-tab only
        static createSynthesizedRemoteEventForCurrentChange(t, e) {
            const n = new Map;
            return n.set(t, Sn.createSynthesizedTargetChangeForCurrentChange(t, e)), new Vn(it.min(), n, vn(), pn(), Pn());
        }
    }

    /**
     * A TargetChange specifies the set of changes for a specific target as part of
     * a RemoteEvent. These changes track which documents are added, modified or
     * removed, as well as the target's resume token and whether the target is
     * marked CURRENT.
     * The actual changes *to* documents are not part of the TargetChange since
     * documents may be part of multiple targets.
     */ class Sn {
        constructor(
        /**
         * An opaque, server-assigned token that allows watching a query to be resumed
         * after disconnecting without retransmitting all the data that matches the
         * query. The resume token essentially identifies a point in time from which
         * the server should resume sending results.
         */
        t, 
        /**
         * The "current" (synced) status of this target. Note that "current"
         * has special meaning in the RPC protocol that implies that a target is
         * both up-to-date and consistent with the rest of the watch stream.
         */
        e, 
        /**
         * The set of documents that were newly assigned to this target as part of
         * this remote event.
         */
        n, 
        /**
         * The set of documents that were already assigned to this target but received
         * an update during this remote event.
         */
        s, 
        /**
         * The set of documents that were removed from this target as part of this
         * remote event.
         */
        i) {
            this.resumeToken = t, this.current = e, this.addedDocuments = n, this.modifiedDocuments = s, 
            this.removedDocuments = i;
        }
        /**
         * This method is used to create a synthesized TargetChanges that can be used to
         * apply a CURRENT status change to a View (for queries executed in a different
         * tab) or for new queries (to raise snapshots with correct CURRENT status).
         */    static createSynthesizedTargetChangeForCurrentChange(t, e) {
            return new Sn(wt.EMPTY_BYTE_STRING, e, Pn(), Pn(), Pn());
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Represents a changed document and a list of target ids to which this change
     * applies.
     *
     * If document has been deleted NoDocument will be provided.
     */ class Dn {
        constructor(
        /** The new document applies to all of these targets. */
        t, 
        /** The new document is removed from all of these targets. */
        e, 
        /** The key of the document for this change. */
        n, 
        /**
         * The new document or NoDocument if it was deleted. Is null if the
         * document went out of view without the server sending a new document.
         */
        s) {
            this.k = t, this.removedTargetIds = e, this.key = n, this.$ = s;
        }
    }

    class Cn {
        constructor(t, e) {
            this.targetId = t, this.O = e;
        }
    }

    class Nn {
        constructor(
        /** What kind of change occurred to the watch target. */
        t, 
        /** The target IDs that were added/removed/set. */
        e, 
        /**
         * An opaque, server-assigned token that allows watching a target to be
         * resumed after disconnecting without retransmitting all the data that
         * matches the target. The resume token essentially identifies a point in
         * time from which the server should resume sending results.
         */
        n = wt.EMPTY_BYTE_STRING
        /** An RPC error indicating why the watch failed. */ , s = null) {
            this.state = t, this.targetIds = e, this.resumeToken = n, this.cause = s;
        }
    }

    /** Tracks the internal state of a Watch target. */ class xn {
        constructor() {
            /**
             * The number of pending responses (adds or removes) that we are waiting on.
             * We only consider targets active that have no pending responses.
             */
            this.F = 0, 
            /**
             * Keeps track of the document changes since the last raised snapshot.
             *
             * These changes are continuously updated as we receive document updates and
             * always reflect the current set of changes against the last issued snapshot.
             */
            this.M = On(), 
            /** See public getters for explanations of these fields. */
            this.L = wt.EMPTY_BYTE_STRING, this.B = !1, 
            /**
             * Whether this target state should be included in the next snapshot. We
             * initialize to true so that newly-added targets are included in the next
             * RemoteEvent.
             */
            this.U = !0;
        }
        /**
         * Whether this target has been marked 'current'.
         *
         * 'Current' has special meaning in the RPC protocol: It implies that the
         * Watch backend has sent us all changes up to the point at which the target
         * was added and that the target is consistent with the rest of the watch
         * stream.
         */    get current() {
            return this.B;
        }
        /** The last resume token sent to us for this target. */    get resumeToken() {
            return this.L;
        }
        /** Whether this target has pending target adds or target removes. */    get q() {
            return 0 !== this.F;
        }
        /** Whether we have modified any state that should trigger a snapshot. */    get K() {
            return this.U;
        }
        /**
         * Applies the resume token to the TargetChange, but only when it has a new
         * value. Empty resumeTokens are discarded.
         */    j(t) {
            t.approximateByteSize() > 0 && (this.U = !0, this.L = t);
        }
        /**
         * Creates a target change from the current set of changes.
         *
         * To reset the document changes after raising this snapshot, call
         * `clearPendingChanges()`.
         */    W() {
            let t = Pn(), e = Pn(), n = Pn();
            return this.M.forEach(((s, i) => {
                switch (i) {
                  case 0 /* Added */ :
                    t = t.add(s);
                    break;

                  case 2 /* Modified */ :
                    e = e.add(s);
                    break;

                  case 1 /* Removed */ :
                    n = n.add(s);
                    break;

                  default:
                    M$1();
                }
            })), new Sn(this.L, this.B, t, e, n);
        }
        /**
         * Resets the document changes and sets `hasPendingChanges` to false.
         */    G() {
            this.U = !1, this.M = On();
        }
        H(t, e) {
            this.U = !0, this.M = this.M.insert(t, e);
        }
        J(t) {
            this.U = !0, this.M = this.M.remove(t);
        }
        Y() {
            this.F += 1;
        }
        X() {
            this.F -= 1;
        }
        Z() {
            this.U = !0, this.B = !0;
        }
    }

    /**
     * A helper class to accumulate watch changes into a RemoteEvent.
     */
    class kn {
        constructor(t) {
            this.tt = t, 
            /** The internal state of all tracked targets. */
            this.et = new Map, 
            /** Keeps track of the documents to update since the last raised snapshot. */
            this.nt = pn(), 
            /** A mapping of document keys to their set of target IDs. */
            this.st = $n(), 
            /**
             * A list of targets with existence filter mismatches. These targets are
             * known to be inconsistent and their listens needs to be re-established by
             * RemoteStore.
             */
            this.it = new mn(tt);
        }
        /**
         * Processes and adds the DocumentWatchChange to the current set of changes.
         */    rt(t) {
            for (const e of t.k) t.$ && t.$.isFoundDocument() ? this.ot(e, t.$) : this.at(e, t.key, t.$);
            for (const e of t.removedTargetIds) this.at(e, t.key, t.$);
        }
        /** Processes and adds the WatchTargetChange to the current set of changes. */    ct(t) {
            this.forEachTarget(t, (e => {
                const n = this.ut(e);
                switch (t.state) {
                  case 0 /* NoChange */ :
                    this.ht(e) && n.j(t.resumeToken);
                    break;

                  case 1 /* Added */ :
                    // We need to decrement the number of pending acks needed from watch
                    // for this targetId.
                    n.X(), n.q || 
                    // We have a freshly added target, so we need to reset any state
                    // that we had previously. This can happen e.g. when remove and add
                    // back a target for existence filter mismatches.
                    n.G(), n.j(t.resumeToken);
                    break;

                  case 2 /* Removed */ :
                    // We need to keep track of removed targets to we can post-filter and
                    // remove any target changes.
                    // We need to decrement the number of pending acks needed from watch
                    // for this targetId.
                    n.X(), n.q || this.removeTarget(e);
                    break;

                  case 3 /* Current */ :
                    this.ht(e) && (n.Z(), n.j(t.resumeToken));
                    break;

                  case 4 /* Reset */ :
                    this.ht(e) && (
                    // Reset the target and synthesizes removes for all existing
                    // documents. The backend will re-add any documents that still
                    // match the target before it sends the next global snapshot.
                    this.lt(e), n.j(t.resumeToken));
                    break;

                  default:
                    M$1();
                }
            }));
        }
        /**
         * Iterates over all targetIds that the watch change applies to: either the
         * targetIds explicitly listed in the change or the targetIds of all currently
         * active targets.
         */    forEachTarget(t, e) {
            t.targetIds.length > 0 ? t.targetIds.forEach(e) : this.et.forEach(((t, n) => {
                this.ht(n) && e(n);
            }));
        }
        /**
         * Handles existence filters and synthesizes deletes for filter mismatches.
         * Targets that are invalidated by filter mismatches are added to
         * `pendingTargetResets`.
         */    ft(t) {
            const e = t.targetId, n = t.O.count, s = this.dt(e);
            if (s) {
                const t = s.target;
                if (zt(t)) if (0 === n) {
                    // The existence filter told us the document does not exist. We deduce
                    // that this document does not exist and apply a deleted document to
                    // our updates. Without applying this deleted document there might be
                    // another query that will raise this document as part of a snapshot
                    // until it is resolved, essentially exposing inconsistency between
                    // queries.
                    const n = new Pt(t.path);
                    this.at(e, n, qt.newNoDocument(n, it.min()));
                } else L$1(1 === n); else {
                    this.wt(e) !== n && (
                    // Existence filter mismatch: We reset the mapping and raise a new
                    // snapshot with `isFromCache:true`.
                    this.lt(e), this.it = this.it.add(e));
                }
            }
        }
        /**
         * Converts the currently accumulated state into a remote event at the
         * provided snapshot version. Resets the accumulated changes before returning.
         */    _t(t) {
            const e = new Map;
            this.et.forEach(((n, s) => {
                const i = this.dt(s);
                if (i) {
                    if (n.current && zt(i.target)) {
                        // Document queries for document that don't exist can produce an empty
                        // result set. To update our local cache, we synthesize a document
                        // delete if we have not previously received the document. This
                        // resolves the limbo state of the document, removing it from
                        // limboDocumentRefs.
                        // TODO(dimond): Ideally we would have an explicit lookup target
                        // instead resulting in an explicit delete message and we could
                        // remove this special logic.
                        const e = new Pt(i.target.path);
                        null !== this.nt.get(e) || this.gt(s, e) || this.at(s, e, qt.newNoDocument(e, t));
                    }
                    n.K && (e.set(s, n.W()), n.G());
                }
            }));
            let n = Pn();
            // We extract the set of limbo-only document updates as the GC logic
            // special-cases documents that do not appear in the target cache.
            
            // TODO(gsoltis): Expand on this comment once GC is available in the JS
            // client.
                    this.st.forEach(((t, e) => {
                let s = !0;
                e.forEachWhile((t => {
                    const e = this.dt(t);
                    return !e || 2 /* LimboResolution */ === e.purpose || (s = !1, !1);
                })), s && (n = n.add(t));
            }));
            const s = new Vn(t, e, this.it, this.nt, n);
            return this.nt = pn(), this.st = $n(), this.it = new mn(tt), s;
        }
        /**
         * Adds the provided document to the internal list of document updates and
         * its document key to the given target's mapping.
         */
        // Visible for testing.
        ot(t, e) {
            if (!this.ht(t)) return;
            const n = this.gt(t, e.key) ? 2 /* Modified */ : 0 /* Added */;
            this.ut(t).H(e.key, n), this.nt = this.nt.insert(e.key, e), this.st = this.st.insert(e.key, this.yt(e.key).add(t));
        }
        /**
         * Removes the provided document from the target mapping. If the
         * document no longer matches the target, but the document's state is still
         * known (e.g. we know that the document was deleted or we received the change
         * that caused the filter mismatch), the new document can be provided
         * to update the remote document cache.
         */
        // Visible for testing.
        at(t, e, n) {
            if (!this.ht(t)) return;
            const s = this.ut(t);
            this.gt(t, e) ? s.H(e, 1 /* Removed */) : 
            // The document may have entered and left the target before we raised a
            // snapshot, so we can just ignore the change.
            s.J(e), this.st = this.st.insert(e, this.yt(e).delete(t)), n && (this.nt = this.nt.insert(e, n));
        }
        removeTarget(t) {
            this.et.delete(t);
        }
        /**
         * Returns the current count of documents in the target. This includes both
         * the number of documents that the LocalStore considers to be part of the
         * target as well as any accumulated changes.
         */    wt(t) {
            const e = this.ut(t).W();
            return this.tt.getRemoteKeysForTarget(t).size + e.addedDocuments.size - e.removedDocuments.size;
        }
        /**
         * Increment the number of acks needed from watch before we can consider the
         * server to be 'in-sync' with the client's active targets.
         */    Y(t) {
            this.ut(t).Y();
        }
        ut(t) {
            let e = this.et.get(t);
            return e || (e = new xn, this.et.set(t, e)), e;
        }
        yt(t) {
            let e = this.st.get(t);
            return e || (e = new mn(tt), this.st = this.st.insert(t, e)), e;
        }
        /**
         * Verifies that the user is still interested in this target (by calling
         * `getTargetDataForTarget()`) and that we are not waiting for pending ADDs
         * from watch.
         */    ht(t) {
            const e = null !== this.dt(t);
            return e || k$1("WatchChangeAggregator", "Detected inactive target", t), e;
        }
        /**
         * Returns the TargetData for an active target (i.e. a target that the user
         * is still interested in that has no outstanding target change requests).
         */    dt(t) {
            const e = this.et.get(t);
            return e && e.q ? null : this.tt.Et(t);
        }
        /**
         * Resets the state of a Watch target to its initial state (e.g. sets
         * 'current' to false, clears the resume token and removes its target mapping
         * from all documents).
         */    lt(t) {
            this.et.set(t, new xn);
            this.tt.getRemoteKeysForTarget(t).forEach((e => {
                this.at(t, e, /*updatedDocument=*/ null);
            }));
        }
        /**
         * Returns whether the LocalStore considers the document to be part of the
         * specified target.
         */    gt(t, e) {
            return this.tt.getRemoteKeysForTarget(t).has(e);
        }
    }

    function $n() {
        return new dn(Pt.comparator);
    }

    function On() {
        return new dn(Pt.comparator);
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ const Fn = (() => {
        const t = {
            asc: "ASCENDING",
            desc: "DESCENDING"
        };
        return t;
    })(), Mn = (() => {
        const t = {
            "<": "LESS_THAN",
            "<=": "LESS_THAN_OR_EQUAL",
            ">": "GREATER_THAN",
            ">=": "GREATER_THAN_OR_EQUAL",
            "==": "EQUAL",
            "!=": "NOT_EQUAL",
            "array-contains": "ARRAY_CONTAINS",
            in: "IN",
            "not-in": "NOT_IN",
            "array-contains-any": "ARRAY_CONTAINS_ANY"
        };
        return t;
    })();

    /**
     * This class generates JsonObject values for the Datastore API suitable for
     * sending to either GRPC stub methods or via the JSON/HTTP REST API.
     *
     * The serializer supports both Protobuf.js and Proto3 JSON formats. By
     * setting `useProto3Json` to true, the serializer will use the Proto3 JSON
     * format.
     *
     * For a description of the Proto3 JSON format check
     * https://developers.google.com/protocol-buffers/docs/proto3#json
     *
     * TODO(klimt): We can remove the databaseId argument if we keep the full
     * resource name in documents.
     */
    class Ln {
        constructor(t, e) {
            this.databaseId = t, this.D = e;
        }
    }

    /**
     * Returns a value for a Date that's appropriate to put into a proto.
     */
    function Bn(t, e) {
        if (t.D) {
            return `${new Date(1e3 * e.seconds).toISOString().replace(/\.\d*/, "").replace("Z", "")}.${("000000000" + e.nanoseconds).slice(-9)}Z`;
        }
        return {
            seconds: "" + e.seconds,
            nanos: e.nanoseconds
        };
    }

    /**
     * Returns a value for bytes that's appropriate to put in a proto.
     *
     * Visible for testing.
     */
    function Un(t, e) {
        return t.D ? e.toBase64() : e.toUint8Array();
    }

    /**
     * Returns a ByteString based on the proto string value.
     */ function qn(t, e) {
        return Bn(t, e.toTimestamp());
    }

    function Kn(t) {
        return L$1(!!t), it.fromTimestamp(function(t) {
            const e = mt(t);
            return new st(e.seconds, e.nanos);
        }(t));
    }

    function jn(t, e) {
        return function(t) {
            return new ut([ "projects", t.projectId, "databases", t.database ]);
        }(t).child("documents").child(e).canonicalString();
    }

    function Qn(t) {
        const e = ut.fromString(t);
        return L$1(ps(e)), e;
    }

    function Wn(t, e) {
        return jn(t.databaseId, e.path);
    }

    function Gn(t, e) {
        const n = Qn(e);
        if (n.get(1) !== t.databaseId.projectId) throw new K$1(q$1.INVALID_ARGUMENT, "Tried to deserialize key from different project: " + n.get(1) + " vs " + t.databaseId.projectId);
        if (n.get(3) !== t.databaseId.database) throw new K$1(q$1.INVALID_ARGUMENT, "Tried to deserialize key from different database: " + n.get(3) + " vs " + t.databaseId.database);
        return new Pt(Yn(n));
    }

    function zn(t, e) {
        return jn(t.databaseId, e);
    }

    function Hn(t) {
        const e = Qn(t);
        // In v1beta1 queries for collections at the root did not have a trailing
        // "/documents". In v1 all resource paths contain "/documents". Preserve the
        // ability to read the v1beta1 form for compatibility with queries persisted
        // in the local target cache.
            return 4 === e.length ? ut.emptyPath() : Yn(e);
    }

    function Jn(t) {
        return new ut([ "projects", t.databaseId.projectId, "databases", t.databaseId.database ]).canonicalString();
    }

    function Yn(t) {
        return L$1(t.length > 4 && "documents" === t.get(4)), t.popFirst(5);
    }

    /** Creates a Document proto from key and fields (but no create/update time) */ function Xn(t, e, n) {
        return {
            name: Wn(t, e),
            fields: n.value.mapValue.fields
        };
    }

    function es(t, e) {
        let n;
        if ("targetChange" in e) {
            e.targetChange;
            // proto3 default value is unset in JSON (undefined), so use 'NO_CHANGE'
            // if unset
            const s = function(t) {
                return "NO_CHANGE" === t ? 0 /* NoChange */ : "ADD" === t ? 1 /* Added */ : "REMOVE" === t ? 2 /* Removed */ : "CURRENT" === t ? 3 /* Current */ : "RESET" === t ? 4 /* Reset */ : M$1();
            }(e.targetChange.targetChangeType || "NO_CHANGE"), i = e.targetChange.targetIds || [], r = function(t, e) {
                return t.D ? (L$1(void 0 === e || "string" == typeof e), wt.fromBase64String(e || "")) : (L$1(void 0 === e || e instanceof Uint8Array), 
                wt.fromUint8Array(e || new Uint8Array));
            }(t, e.targetChange.resumeToken), o = e.targetChange.cause, a = o && function(t) {
                const e = void 0 === t.code ? q$1.UNKNOWN : fn(t.code);
                return new K$1(e, t.message || "");
            }
            /**
     * Returns a value for a number (or null) that's appropriate to put into
     * a google.protobuf.Int32Value proto.
     * DO NOT USE THIS FOR ANYTHING ELSE.
     * This method cheats. It's typed as returning "number" because that's what
     * our generated proto interfaces say Int32Value must be. But GRPC actually
     * expects a { value: <number> } struct.
     */ (o);
            n = new Nn(s, i, r, a || null);
        } else if ("documentChange" in e) {
            e.documentChange;
            const s = e.documentChange;
            s.document, s.document.name, s.document.updateTime;
            const i = Gn(t, s.document.name), r = Kn(s.document.updateTime), o = new Bt({
                mapValue: {
                    fields: s.document.fields
                }
            }), a = qt.newFoundDocument(i, r, o), c = s.targetIds || [], u = s.removedTargetIds || [];
            n = new Dn(c, u, a.key, a);
        } else if ("documentDelete" in e) {
            e.documentDelete;
            const s = e.documentDelete;
            s.document;
            const i = Gn(t, s.document), r = s.readTime ? Kn(s.readTime) : it.min(), o = qt.newNoDocument(i, r), a = s.removedTargetIds || [];
            n = new Dn([], a, o.key, o);
        } else if ("documentRemove" in e) {
            e.documentRemove;
            const s = e.documentRemove;
            s.document;
            const i = Gn(t, s.document), r = s.removedTargetIds || [];
            n = new Dn([], r, i, null);
        } else {
            if (!("filter" in e)) return M$1();
            {
                e.filter;
                const t = e.filter;
                t.targetId;
                const s = t.count || 0, i = new cn(s), r = t.targetId;
                n = new Cn(r, i);
            }
        }
        return n;
    }

    function ns(t, e) {
        let n;
        if (e instanceof tn) n = {
            update: Xn(t, e.key, e.value)
        }; else if (e instanceof on) n = {
            delete: Wn(t, e.key)
        }; else if (e instanceof en) n = {
            update: Xn(t, e.key, e.data),
            updateMask: ys(e.fieldMask)
        }; else {
            if (!(e instanceof an)) return M$1();
            n = {
                verify: Wn(t, e.key)
            };
        }
        return e.fieldTransforms.length > 0 && (n.updateTransforms = e.fieldTransforms.map((t => function(t, e) {
            const n = e.transform;
            if (n instanceof $e) return {
                fieldPath: e.field.canonicalString(),
                setToServerValue: "REQUEST_TIME"
            };
            if (n instanceof Oe) return {
                fieldPath: e.field.canonicalString(),
                appendMissingElements: {
                    values: n.elements
                }
            };
            if (n instanceof Me) return {
                fieldPath: e.field.canonicalString(),
                removeAllFromArray: {
                    values: n.elements
                }
            };
            if (n instanceof Be) return {
                fieldPath: e.field.canonicalString(),
                increment: n.C
            };
            throw M$1();
        }(0, t)))), e.precondition.isNone || (n.currentDocument = function(t, e) {
            return void 0 !== e.updateTime ? {
                updateTime: qn(t, e.updateTime)
            } : void 0 !== e.exists ? {
                exists: e.exists
            } : M$1();
        }(t, e.precondition)), n;
    }

    function is(t, e) {
        return t && t.length > 0 ? (L$1(void 0 !== e), t.map((t => function(t, e) {
            // NOTE: Deletes don't have an updateTime.
            let n = t.updateTime ? Kn(t.updateTime) : Kn(e);
            return n.isEqual(it.min()) && (
            // The Firestore Emulator currently returns an update time of 0 for
            // deletes of non-existing documents (rather than null). This breaks the
            // test "get deleted doc while offline with source=cache" as NoDocuments
            // with version 0 are filtered by IndexedDb's RemoteDocumentCache.
            // TODO(#2149): Remove this when Emulator is fixed
            n = Kn(e)), new Qe(n, t.transformResults || []);
        }(t, e)))) : [];
    }

    function rs(t, e) {
        return {
            documents: [ zn(t, e.path) ]
        };
    }

    function os(t, e) {
        // Dissect the path into parent, collectionId, and optional key filter.
        const n = {
            structuredQuery: {}
        }, s = e.path;
        null !== e.collectionGroup ? (n.parent = zn(t, s), n.structuredQuery.from = [ {
            collectionId: e.collectionGroup,
            allDescendants: !0
        } ]) : (n.parent = zn(t, s.popLast()), n.structuredQuery.from = [ {
            collectionId: s.lastSegment()
        } ]);
        const i = function(t) {
            if (0 === t.length) return;
            const e = t.map((t => 
            // visible for testing
            function(t) {
                if ("==" /* EQUAL */ === t.op) {
                    if (Ft(t.value)) return {
                        unaryFilter: {
                            field: ws(t.field),
                            op: "IS_NAN"
                        }
                    };
                    if (Ot(t.value)) return {
                        unaryFilter: {
                            field: ws(t.field),
                            op: "IS_NULL"
                        }
                    };
                } else if ("!=" /* NOT_EQUAL */ === t.op) {
                    if (Ft(t.value)) return {
                        unaryFilter: {
                            field: ws(t.field),
                            op: "IS_NOT_NAN"
                        }
                    };
                    if (Ot(t.value)) return {
                        unaryFilter: {
                            field: ws(t.field),
                            op: "IS_NOT_NULL"
                        }
                    };
                }
                return {
                    fieldFilter: {
                        field: ws(t.field),
                        op: ds(t.op),
                        value: t.value
                    }
                };
            }(t)));
            if (1 === e.length) return e[0];
            return {
                compositeFilter: {
                    op: "AND",
                    filters: e
                }
            };
        }(e.filters);
        i && (n.structuredQuery.where = i);
        const r = function(t) {
            if (0 === t.length) return;
            return t.map((t => 
            // visible for testing
            function(t) {
                return {
                    field: ws(t.field),
                    direction: fs(t.dir)
                };
            }(t)));
        }(e.orderBy);
        r && (n.structuredQuery.orderBy = r);
        const o = function(t, e) {
            return t.D || It(e) ? e : {
                value: e
            };
        }
        /**
     * Returns a number (or null) from a google.protobuf.Int32Value proto.
     */ (t, e.limit);
        return null !== o && (n.structuredQuery.limit = o), e.startAt && (n.structuredQuery.startAt = hs(e.startAt)), 
        e.endAt && (n.structuredQuery.endAt = hs(e.endAt)), n;
    }

    function as(t) {
        let e = Hn(t.parent);
        const n = t.structuredQuery, s = n.from ? n.from.length : 0;
        let i = null;
        if (s > 0) {
            L$1(1 === s);
            const t = n.from[0];
            t.allDescendants ? i = t.collectionId : e = e.child(t.collectionId);
        }
        let r = [];
        n.where && (r = us(n.where));
        let o = [];
        n.orderBy && (o = n.orderBy.map((t => function(t) {
            return new ae(_s(t.field), 
            // visible for testing
            function(t) {
                switch (t) {
                  case "ASCENDING":
                    return "asc" /* ASCENDING */;

                  case "DESCENDING":
                    return "desc" /* DESCENDING */;

                  default:
                    return;
                }
            }
            // visible for testing
            (t.direction));
        }(t))));
        let a = null;
        n.limit && (a = function(t) {
            let e;
            return e = "object" == typeof t ? t.value : t, It(e) ? null : e;
        }(n.limit));
        let c = null;
        n.startAt && (c = ls(n.startAt));
        let u = null;
        return n.endAt && (u = ls(n.endAt)), fe(e, i, o, r, a, "F" /* First */ , c, u);
    }

    function cs(t, e) {
        const n = function(t, e) {
            switch (e) {
              case 0 /* Listen */ :
                return null;

              case 1 /* ExistenceFilterMismatch */ :
                return "existence-filter-mismatch";

              case 2 /* LimboResolution */ :
                return "limbo-document";

              default:
                return M$1();
            }
        }(0, e.purpose);
        return null == n ? null : {
            "goog-listen-tags": n
        };
    }

    function us(t) {
        return t ? void 0 !== t.unaryFilter ? [ gs(t) ] : void 0 !== t.fieldFilter ? [ ms(t) ] : void 0 !== t.compositeFilter ? t.compositeFilter.filters.map((t => us(t))).reduce(((t, e) => t.concat(e))) : M$1() : [];
    }

    function hs(t) {
        return {
            before: t.before,
            values: t.position
        };
    }

    function ls(t) {
        const e = !!t.before, n = t.values || [];
        return new re(n, e);
    }

    // visible for testing
    function fs(t) {
        return Fn[t];
    }

    function ds(t) {
        return Mn[t];
    }

    function ws(t) {
        return {
            fieldPath: t.canonicalString()
        };
    }

    function _s(t) {
        return lt.fromServerFormat(t.fieldPath);
    }

    function ms(t) {
        return Ht.create(_s(t.fieldFilter.field), function(t) {
            switch (t) {
              case "EQUAL":
                return "==" /* EQUAL */;

              case "NOT_EQUAL":
                return "!=" /* NOT_EQUAL */;

              case "GREATER_THAN":
                return ">" /* GREATER_THAN */;

              case "GREATER_THAN_OR_EQUAL":
                return ">=" /* GREATER_THAN_OR_EQUAL */;

              case "LESS_THAN":
                return "<" /* LESS_THAN */;

              case "LESS_THAN_OR_EQUAL":
                return "<=" /* LESS_THAN_OR_EQUAL */;

              case "ARRAY_CONTAINS":
                return "array-contains" /* ARRAY_CONTAINS */;

              case "IN":
                return "in" /* IN */;

              case "NOT_IN":
                return "not-in" /* NOT_IN */;

              case "ARRAY_CONTAINS_ANY":
                return "array-contains-any" /* ARRAY_CONTAINS_ANY */;

              case "OPERATOR_UNSPECIFIED":
              default:
                return M$1();
            }
        }(t.fieldFilter.op), t.fieldFilter.value);
    }

    function gs(t) {
        switch (t.unaryFilter.op) {
          case "IS_NAN":
            const e = _s(t.unaryFilter.field);
            return Ht.create(e, "==" /* EQUAL */ , {
                doubleValue: NaN
            });

          case "IS_NULL":
            const n = _s(t.unaryFilter.field);
            return Ht.create(n, "==" /* EQUAL */ , {
                nullValue: "NULL_VALUE"
            });

          case "IS_NOT_NAN":
            const s = _s(t.unaryFilter.field);
            return Ht.create(s, "!=" /* NOT_EQUAL */ , {
                doubleValue: NaN
            });

          case "IS_NOT_NULL":
            const i = _s(t.unaryFilter.field);
            return Ht.create(i, "!=" /* NOT_EQUAL */ , {
                nullValue: "NULL_VALUE"
            });

          case "OPERATOR_UNSPECIFIED":
          default:
            return M$1();
        }
    }

    function ys(t) {
        const e = [];
        return t.fields.forEach((t => e.push(t.canonicalString()))), {
            fieldPaths: e
        };
    }

    function ps(t) {
        // Resource names have at least 4 components (project ID, database ID)
        return t.length >= 4 && "projects" === t.get(0) && "databases" === t.get(2);
    }

    // Visible for testing
    const Us = "The current tab is not in the required state to perform this operation. It might be necessary to refresh the browser tab.";

    // V2 is no longer usable (see comment at top of file)
    // Visible for testing
    /**
     * A base class representing a persistence transaction, encapsulating both the
     * transaction's sequence numbers as well as a list of onCommitted listeners.
     *
     * When you call Persistence.runTransaction(), it will create a transaction and
     * pass it to your callback. You then pass it to any method that operates
     * on persistence.
     */
    class qs {
        constructor() {
            this.onCommittedListeners = [];
        }
        addOnCommittedListener(t) {
            this.onCommittedListeners.push(t);
        }
        raiseOnCommittedEvent() {
            this.onCommittedListeners.forEach((t => t()));
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * PersistencePromise is essentially a re-implementation of Promise except
     * it has a .next() method instead of .then() and .next() and .catch() callbacks
     * are executed synchronously when a PersistencePromise resolves rather than
     * asynchronously (Promise implementations use setImmediate() or similar).
     *
     * This is necessary to interoperate with IndexedDB which will automatically
     * commit transactions if control is returned to the event loop without
     * synchronously initiating another operation on the transaction.
     *
     * NOTE: .then() and .catch() only allow a single consumer, unlike normal
     * Promises.
     */ class Ks {
        constructor(t) {
            // NOTE: next/catchCallback will always point to our own wrapper functions,
            // not the user's raw next() or catch() callbacks.
            this.nextCallback = null, this.catchCallback = null, 
            // When the operation resolves, we'll set result or error and mark isDone.
            this.result = void 0, this.error = void 0, this.isDone = !1, 
            // Set to true when .then() or .catch() are called and prevents additional
            // chaining.
            this.callbackAttached = !1, t((t => {
                this.isDone = !0, this.result = t, this.nextCallback && 
                // value should be defined unless T is Void, but we can't express
                // that in the type system.
                this.nextCallback(t);
            }), (t => {
                this.isDone = !0, this.error = t, this.catchCallback && this.catchCallback(t);
            }));
        }
        catch(t) {
            return this.next(void 0, t);
        }
        next(t, e) {
            return this.callbackAttached && M$1(), this.callbackAttached = !0, this.isDone ? this.error ? this.wrapFailure(e, this.error) : this.wrapSuccess(t, this.result) : new Ks(((n, s) => {
                this.nextCallback = e => {
                    this.wrapSuccess(t, e).next(n, s);
                }, this.catchCallback = t => {
                    this.wrapFailure(e, t).next(n, s);
                };
            }));
        }
        toPromise() {
            return new Promise(((t, e) => {
                this.next(t, e);
            }));
        }
        wrapUserFunction(t) {
            try {
                const e = t();
                return e instanceof Ks ? e : Ks.resolve(e);
            } catch (t) {
                return Ks.reject(t);
            }
        }
        wrapSuccess(t, e) {
            return t ? this.wrapUserFunction((() => t(e))) : Ks.resolve(e);
        }
        wrapFailure(t, e) {
            return t ? this.wrapUserFunction((() => t(e))) : Ks.reject(e);
        }
        static resolve(t) {
            return new Ks(((e, n) => {
                e(t);
            }));
        }
        static reject(t) {
            return new Ks(((e, n) => {
                n(t);
            }));
        }
        static waitFor(
        // Accept all Promise types in waitFor().
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        t) {
            return new Ks(((e, n) => {
                let s = 0, i = 0, r = !1;
                t.forEach((t => {
                    ++s, t.next((() => {
                        ++i, r && i === s && e();
                    }), (t => n(t)));
                })), r = !0, i === s && e();
            }));
        }
        /**
         * Given an array of predicate functions that asynchronously evaluate to a
         * boolean, implements a short-circuiting `or` between the results. Predicates
         * will be evaluated until one of them returns `true`, then stop. The final
         * result will be whether any of them returned `true`.
         */    static or(t) {
            let e = Ks.resolve(!1);
            for (const n of t) e = e.next((t => t ? Ks.resolve(t) : n()));
            return e;
        }
        static forEach(t, e) {
            const n = [];
            return t.forEach(((t, s) => {
                n.push(e.call(this, t, s));
            })), this.waitFor(n);
        }
    }

    /** Verifies whether `e` is an IndexedDbTransactionError. */ function zs(t) {
        // Use name equality, as instanceof checks on errors don't work with errors
        // that wrap other errors.
        return "IndexedDbTransactionError" === t.name;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A batch of mutations that will be sent as one unit to the backend.
     */ class ei {
        /**
         * @param batchId - The unique ID of this mutation batch.
         * @param localWriteTime - The original write time of this mutation.
         * @param baseMutations - Mutations that are used to populate the base
         * values when this mutation is applied locally. This can be used to locally
         * overwrite values that are persisted in the remote document cache. Base
         * mutations are never sent to the backend.
         * @param mutations - The user-provided mutations in this mutation batch.
         * User-provided mutations are applied both locally and remotely on the
         * backend.
         */
        constructor(t, e, n, s) {
            this.batchId = t, this.localWriteTime = e, this.baseMutations = n, this.mutations = s;
        }
        /**
         * Applies all the mutations in this MutationBatch to the specified document
         * to compute the state of the remote document
         *
         * @param document - The document to apply mutations to.
         * @param batchResult - The result of applying the MutationBatch to the
         * backend.
         */    applyToRemoteDocument(t, e) {
            const n = e.mutationResults;
            for (let e = 0; e < this.mutations.length; e++) {
                const s = this.mutations[e];
                if (s.key.isEqual(t.key)) {
                    He(s, t, n[e]);
                }
            }
        }
        /**
         * Computes the local view of a document given all the mutations in this
         * batch.
         *
         * @param document - The document to apply mutations to.
         */    applyToLocalView(t) {
            // First, apply the base state. This allows us to apply non-idempotent
            // transform against a consistent set of values.
            for (const e of this.baseMutations) e.key.isEqual(t.key) && Je(e, t, this.localWriteTime);
            // Second, apply all user-provided mutations.
                    for (const e of this.mutations) e.key.isEqual(t.key) && Je(e, t, this.localWriteTime);
        }
        /**
         * Computes the local view for all provided documents given the mutations in
         * this batch.
         */    applyToLocalDocumentSet(t) {
            // TODO(mrschmidt): This implementation is O(n^2). If we apply the mutations
            // directly (as done in `applyToLocalView()`), we can reduce the complexity
            // to O(n).
            this.mutations.forEach((e => {
                const n = t.get(e.key), s = n;
                // TODO(mutabledocuments): This method should take a MutableDocumentMap
                // and we should remove this cast.
                            this.applyToLocalView(s), n.isValidDocument() || s.convertToNoDocument(it.min());
            }));
        }
        keys() {
            return this.mutations.reduce(((t, e) => t.add(e.key)), Pn());
        }
        isEqual(t) {
            return this.batchId === t.batchId && et(this.mutations, t.mutations, ((t, e) => Xe(t, e))) && et(this.baseMutations, t.baseMutations, ((t, e) => Xe(t, e)));
        }
    }

    /** The result of applying a mutation batch to the backend. */ class ni {
        constructor(t, e, n, 
        /**
         * A pre-computed mapping from each mutated document to the resulting
         * version.
         */
        s) {
            this.batch = t, this.commitVersion = e, this.mutationResults = n, this.docVersions = s;
        }
        /**
         * Creates a new MutationBatchResult for the given batch and results. There
         * must be one result for each mutation in the batch. This static factory
         * caches a document=&gt;version mapping (docVersions).
         */    static from(t, e, n) {
            L$1(t.mutations.length === n.length);
            let s = An();
            const i = t.mutations;
            for (let t = 0; t < i.length; t++) s = s.insert(i[t].key, n[t].version);
            return new ni(t, e, n, s);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * An immutable set of metadata that the local store tracks for each target.
     */ class si {
        constructor(
        /** The target being listened to. */
        t, 
        /**
         * The target ID to which the target corresponds; Assigned by the
         * LocalStore for user listens and by the SyncEngine for limbo watches.
         */
        e, 
        /** The purpose of the target. */
        n, 
        /**
         * The sequence number of the last transaction during which this target data
         * was modified.
         */
        s, 
        /** The latest snapshot version seen for this target. */
        i = it.min()
        /**
         * The maximum snapshot version at which the associated view
         * contained no limbo documents.
         */ , r = it.min()
        /**
         * An opaque, server-assigned token that allows watching a target to be
         * resumed after disconnecting without retransmitting all the data that
         * matches the target. The resume token essentially identifies a point in
         * time from which the server should resume sending results.
         */ , o = wt.EMPTY_BYTE_STRING) {
            this.target = t, this.targetId = e, this.purpose = n, this.sequenceNumber = s, this.snapshotVersion = i, 
            this.lastLimboFreeSnapshotVersion = r, this.resumeToken = o;
        }
        /** Creates a new target data instance with an updated sequence number. */    withSequenceNumber(t) {
            return new si(this.target, this.targetId, this.purpose, t, this.snapshotVersion, this.lastLimboFreeSnapshotVersion, this.resumeToken);
        }
        /**
         * Creates a new target data instance with an updated resume token and
         * snapshot version.
         */    withResumeToken(t, e) {
            return new si(this.target, this.targetId, this.purpose, this.sequenceNumber, e, this.lastLimboFreeSnapshotVersion, t);
        }
        /**
         * Creates a new target data instance with an updated last limbo free
         * snapshot version number.
         */    withLastLimboFreeSnapshotVersion(t) {
            return new si(this.target, this.targetId, this.purpose, this.sequenceNumber, this.snapshotVersion, t, this.resumeToken);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /** Serializer for values stored in the LocalStore. */ class ii {
        constructor(t) {
            this.Wt = t;
        }
    }

    /**
     * A helper function for figuring out what kind of query has been stored.
     */
    /**
     * Encodes a `BundledQuery` from bundle proto to a Query object.
     *
     * This reconstructs the original query used to build the bundle being loaded,
     * including features exists only in SDKs (for example: limit-to-last).
     */
    function wi(t) {
        const e = as({
            parent: t.parent,
            structuredQuery: t.structuredQuery
        });
        return "LAST" === t.limitType ? Te(e, e.limit, "L" /* Last */) : e;
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * An in-memory implementation of IndexManager.
     */ class yi {
        constructor() {
            this.Gt = new pi;
        }
        addToCollectionParentIndex(t, e) {
            return this.Gt.add(e), Ks.resolve();
        }
        getCollectionParents(t, e) {
            return Ks.resolve(this.Gt.getEntries(e));
        }
    }

    /**
     * Internal implementation of the collection-parent index exposed by MemoryIndexManager.
     * Also used for in-memory caching by IndexedDbIndexManager and initial index population
     * in indexeddb_schema.ts
     */ class pi {
        constructor() {
            this.index = {};
        }
        // Returns false if the entry already existed.
        add(t) {
            const e = t.lastSegment(), n = t.popLast(), s = this.index[e] || new mn(ut.comparator), i = !s.has(n);
            return this.index[e] = s.add(n), i;
        }
        has(t) {
            const e = t.lastSegment(), n = t.popLast(), s = this.index[e];
            return s && s.has(n);
        }
        getEntries(t) {
            return (this.index[t] || new mn(ut.comparator)).toArray();
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /** Offset to ensure non-overlapping target ids. */
    /**
     * Generates monotonically increasing target IDs for sending targets to the
     * watch stream.
     *
     * The client constructs two generators, one for the target cache, and one for
     * for the sync engine (to generate limbo documents targets). These
     * generators produce non-overlapping IDs (by using even and odd IDs
     * respectively).
     *
     * By separating the target ID space, the query cache can generate target IDs
     * that persist across client restarts, while sync engine can independently
     * generate in-memory target IDs that are transient and can be reused after a
     * restart.
     */
    class Ci {
        constructor(t) {
            this.ne = t;
        }
        next() {
            return this.ne += 2, this.ne;
        }
        static se() {
            // The target cache generator must return '2' in its first call to `next()`
            // as there is no differentiation in the protocol layer between an unset
            // number and the number '0'. If we were to sent a target with target ID
            // '0', the backend would consider it unset and replace it with its own ID.
            return new Ci(0);
        }
        static ie() {
            // Sync engine assigns target IDs for limbo document detection.
            return new Ci(-1);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Verifies the error thrown by a LocalStore operation. If a LocalStore
     * operation fails because the primary lease has been taken by another client,
     * we ignore the error (the persistence layer will immediately call
     * `applyPrimaryLease` to propagate the primary state change). All other errors
     * are re-thrown.
     *
     * @param err - An error returned by a LocalStore operation.
     * @returns A Promise that resolves after we recovered, or the original error.
     */ async function Oi(t) {
        if (t.code !== q$1.FAILED_PRECONDITION || t.message !== Us) throw t;
        k$1("LocalStore", "Unexpectedly lost primary lease");
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A map implementation that uses objects as keys. Objects must have an
     * associated equals function and must be immutable. Entries in the map are
     * stored together with the key being produced from the mapKeyFn. This map
     * automatically handles collisions of keys.
     */ class Ki {
        constructor(t, e) {
            this.mapKeyFn = t, this.equalsFn = e, 
            /**
             * The inner map for a key/value pair. Due to the possibility of collisions we
             * keep a list of entries that we do a linear search through to find an actual
             * match. Note that collisions should be rare, so we still expect near
             * constant time lookups in practice.
             */
            this.inner = {};
        }
        /** Get a value for this key, or undefined if it does not exist. */    get(t) {
            const e = this.mapKeyFn(t), n = this.inner[e];
            if (void 0 !== n) for (const [e, s] of n) if (this.equalsFn(e, t)) return s;
        }
        has(t) {
            return void 0 !== this.get(t);
        }
        /** Put this key and value in the map. */    set(t, e) {
            const n = this.mapKeyFn(t), s = this.inner[n];
            if (void 0 !== s) {
                for (let n = 0; n < s.length; n++) if (this.equalsFn(s[n][0], t)) return void (s[n] = [ t, e ]);
                s.push([ t, e ]);
            } else this.inner[n] = [ [ t, e ] ];
        }
        /**
         * Remove this key from the map. Returns a boolean if anything was deleted.
         */    delete(t) {
            const e = this.mapKeyFn(t), n = this.inner[e];
            if (void 0 === n) return !1;
            for (let s = 0; s < n.length; s++) if (this.equalsFn(n[s][0], t)) return 1 === n.length ? delete this.inner[e] : n.splice(s, 1), 
            !0;
            return !1;
        }
        forEach(t) {
            ot(this.inner, ((e, n) => {
                for (const [e, s] of n) t(e, s);
            }));
        }
        isEmpty() {
            return at(this.inner);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * An in-memory buffer of entries to be written to a RemoteDocumentCache.
     * It can be used to batch up a set of changes to be written to the cache, but
     * additionally supports reading entries back with the `getEntry()` method,
     * falling back to the underlying RemoteDocumentCache if no entry is
     * buffered.
     *
     * Entries added to the cache *must* be read first. This is to facilitate
     * calculating the size delta of the pending changes.
     *
     * PORTING NOTE: This class was implemented then removed from other platforms.
     * If byte-counting ends up being needed on the other platforms, consider
     * porting this class as part of that implementation work.
     */ class ji {
        constructor() {
            // A mapping of document key to the new cache entry that should be written (or null if any
            // existing cache entry should be removed).
            this.changes = new Ki((t => t.toString()), ((t, e) => t.isEqual(e))), this.changesApplied = !1;
        }
        getReadTime(t) {
            const e = this.changes.get(t);
            return e ? e.readTime : it.min();
        }
        /**
         * Buffers a `RemoteDocumentCache.addEntry()` call.
         *
         * You can only modify documents that have already been retrieved via
         * `getEntry()/getEntries()` (enforced via IndexedDbs `apply()`).
         */    addEntry(t, e) {
            this.assertNotApplied(), this.changes.set(t.key, {
                document: t,
                readTime: e
            });
        }
        /**
         * Buffers a `RemoteDocumentCache.removeEntry()` call.
         *
         * You can only remove documents that have already been retrieved via
         * `getEntry()/getEntries()` (enforced via IndexedDbs `apply()`).
         */    removeEntry(t, e = null) {
            this.assertNotApplied(), this.changes.set(t, {
                document: qt.newInvalidDocument(t),
                readTime: e
            });
        }
        /**
         * Looks up an entry in the cache. The buffered changes will first be checked,
         * and if no buffered change applies, this will forward to
         * `RemoteDocumentCache.getEntry()`.
         *
         * @param transaction - The transaction in which to perform any persistence
         *     operations.
         * @param documentKey - The key of the entry to look up.
         * @returns The cached document or an invalid document if we have nothing
         * cached.
         */    getEntry(t, e) {
            this.assertNotApplied();
            const n = this.changes.get(e);
            return void 0 !== n ? Ks.resolve(n.document) : this.getFromCache(t, e);
        }
        /**
         * Looks up several entries in the cache, forwarding to
         * `RemoteDocumentCache.getEntry()`.
         *
         * @param transaction - The transaction in which to perform any persistence
         *     operations.
         * @param documentKeys - The keys of the entries to look up.
         * @returns A map of cached documents, indexed by key. If an entry cannot be
         *     found, the corresponding key will be mapped to an invalid document.
         */    getEntries(t, e) {
            return this.getAllFromCache(t, e);
        }
        /**
         * Applies buffered changes to the underlying RemoteDocumentCache, using
         * the provided transaction.
         */    apply(t) {
            return this.assertNotApplied(), this.changesApplied = !0, this.applyChanges(t);
        }
        /** Helper to assert this.changes is not null  */    assertNotApplied() {}
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A readonly view of the local state of all documents we're tracking (i.e. we
     * have a cached version in remoteDocumentCache or local mutations for the
     * document). The view is computed by applying the mutations in the
     * MutationQueue to the RemoteDocumentCache.
     */ class ir {
        constructor(t, e, n) {
            this.He = t, this.In = e, this.Ht = n;
        }
        /**
         * Get the local view of the document identified by `key`.
         *
         * @returns Local view of the document or null if we don't have any cached
         * state for it.
         */    An(t, e) {
            return this.In.getAllMutationBatchesAffectingDocumentKey(t, e).next((n => this.Rn(t, e, n)));
        }
        /** Internal version of `getDocument` that allows reusing batches. */    Rn(t, e, n) {
            return this.He.getEntry(t, e).next((t => {
                for (const e of n) e.applyToLocalView(t);
                return t;
            }));
        }
        // Returns the view of the given `docs` as they would appear after applying
        // all mutations in the given `batches`.
        Pn(t, e) {
            t.forEach(((t, n) => {
                for (const t of e) t.applyToLocalView(n);
            }));
        }
        /**
         * Gets the local view of the documents identified by `keys`.
         *
         * If we don't have cached state for a document in `keys`, a NoDocument will
         * be stored for that key in the resulting set.
         */    bn(t, e) {
            return this.He.getEntries(t, e).next((e => this.vn(t, e).next((() => e))));
        }
        /**
         * Applies the local view the given `baseDocs` without retrieving documents
         * from the local store.
         */    vn(t, e) {
            return this.In.getAllMutationBatchesAffectingDocumentKeys(t, e).next((t => this.Pn(e, t)));
        }
        /**
         * Performs a query against the local view of all documents.
         *
         * @param transaction - The persistence transaction.
         * @param query - The query to match documents against.
         * @param sinceReadTime - If not set to SnapshotVersion.min(), return only
         *     documents that have been read since this snapshot version (exclusive).
         */    getDocumentsMatchingQuery(t, e, n) {
            /**
     * Returns whether the query matches a single document by path (rather than a
     * collection).
     */
            return function(t) {
                return Pt.isDocumentKey(t.path) && null === t.collectionGroup && 0 === t.filters.length;
            }(e) ? this.Vn(t, e.path) : ye(e) ? this.Sn(t, e, n) : this.Dn(t, e, n);
        }
        Vn(t, e) {
            // Just do a simple document lookup.
            return this.An(t, new Pt(e)).next((t => {
                let e = Tn();
                return t.isFoundDocument() && (e = e.insert(t.key, t)), e;
            }));
        }
        Sn(t, e, n) {
            const s = e.collectionGroup;
            let i = Tn();
            return this.Ht.getCollectionParents(t, s).next((r => Ks.forEach(r, (r => {
                const o = function(t, e) {
                    return new le(e, 
                    /*collectionGroup=*/ null, t.explicitOrderBy.slice(), t.filters.slice(), t.limit, t.limitType, t.startAt, t.endAt);
                }
                /**
     * Returns true if this query does not specify any query constraints that
     * could remove results.
     */ (e, r.child(s));
                return this.Dn(t, o, n).next((t => {
                    t.forEach(((t, e) => {
                        i = i.insert(t, e);
                    }));
                }));
            })).next((() => i))));
        }
        Dn(t, e, n) {
            // Query the remote documents and overlay mutations.
            let s, i;
            return this.He.getDocumentsMatchingQuery(t, e, n).next((n => (s = n, this.In.getAllMutationBatchesAffectingQuery(t, e)))).next((e => (i = e, 
            this.Cn(t, i, s).next((t => {
                s = t;
                for (const t of i) for (const e of t.mutations) {
                    const n = e.key;
                    let i = s.get(n);
                    null == i && (
                    // Create invalid document to apply mutations on top of
                    i = qt.newInvalidDocument(n), s = s.insert(n, i)), Je(e, i, t.localWriteTime), i.isFoundDocument() || (s = s.remove(n));
                }
            }))))).next((() => (
            // Finally, filter out any documents that don't actually match
            // the query.
            s.forEach(((t, n) => {
                Pe(e, n) || (s = s.remove(t));
            })), s)));
        }
        Cn(t, e, n) {
            let s = Pn();
            for (const t of e) for (const e of t.mutations) e instanceof en && null === n.get(e.key) && (s = s.add(e.key));
            let i = n;
            return this.He.getEntries(t, s).next((t => (t.forEach(((t, e) => {
                e.isFoundDocument() && (i = i.insert(t, e));
            })), i)));
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A set of changes to what documents are currently in view and out of view for
     * a given query. These changes are sent to the LocalStore by the View (via
     * the SyncEngine) and are used to pin / unpin documents as appropriate.
     */ class rr {
        constructor(t, e, n, s) {
            this.targetId = t, this.fromCache = e, this.Nn = n, this.xn = s;
        }
        static kn(t, e) {
            let n = Pn(), s = Pn();
            for (const t of e.docChanges) switch (t.type) {
              case 0 /* Added */ :
                n = n.add(t.doc.key);
                break;

              case 1 /* Removed */ :
                s = s.add(t.doc.key);
     // do nothing
                    }
            return new rr(t, e.fromCache, n, s);
        }
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A query engine that takes advantage of the target document mapping in the
     * QueryCache. Query execution is optimized by only reading the documents that
     * previously matched a query plus any documents that were edited after the
     * query was last listened to.
     *
     * There are some cases when this optimization is not guaranteed to produce
     * the same results as full collection scans. In these cases, query
     * processing falls back to full scans. These cases are:
     *
     * - Limit queries where a document that matched the query previously no longer
     *   matches the query.
     *
     * - Limit queries where a document edit may cause the document to sort below
     *   another document that is in the local cache.
     *
     * - Queries that have never been CURRENT or free of limbo documents.
     */ class or {
        /** Sets the document view to query against. */
        $n(t) {
            this.On = t;
        }
        /** Returns all local documents matching the specified query. */    getDocumentsMatchingQuery(t, e, n, s) {
            // Queries that match all documents don't benefit from using
            // key-based lookups. It is more efficient to scan all documents in a
            // collection, rather than to perform individual lookups.
            return function(t) {
                return 0 === t.filters.length && null === t.limit && null == t.startAt && null == t.endAt && (0 === t.explicitOrderBy.length || 1 === t.explicitOrderBy.length && t.explicitOrderBy[0].field.isKeyField());
            }(e) || n.isEqual(it.min()) ? this.Fn(t, e) : this.On.bn(t, s).next((i => {
                const r = this.Mn(e, i);
                return (we(e) || _e(e)) && this.Ln(e.limitType, r, s, n) ? this.Fn(t, e) : (N$1() <= LogLevel.DEBUG && k$1("QueryEngine", "Re-using previous result from %s to execute query: %s", n.toString(), Re(e)), 
                this.On.getDocumentsMatchingQuery(t, e, n).next((t => (
                // We merge `previousResults` into `updateResults`, since
                // `updateResults` is already a DocumentMap. If a document is
                // contained in both lists, then its contents are the same.
                r.forEach((e => {
                    t = t.insert(e.key, e);
                })), t))));
            }));
            // Queries that have never seen a snapshot without limbo free documents
            // should also be run as a full collection scan.
            }
        /** Applies the query filter and sorting to the provided documents.  */    Mn(t, e) {
            // Sort the documents and re-apply the query filter since previously
            // matching documents do not necessarily still match the query.
            let n = new mn(be(t));
            return e.forEach(((e, s) => {
                Pe(t, s) && (n = n.add(s));
            })), n;
        }
        /**
         * Determines if a limit query needs to be refilled from cache, making it
         * ineligible for index-free execution.
         *
         * @param sortedPreviousResults - The documents that matched the query when it
         * was last synchronized, sorted by the query's comparator.
         * @param remoteKeys - The document keys that matched the query at the last
         * snapshot.
         * @param limboFreeSnapshotVersion - The version of the snapshot when the
         * query was last synchronized.
         */    Ln(t, e, n, s) {
            // The query needs to be refilled if a previously matching document no
            // longer matches.
            if (n.size !== e.size) return !0;
            // Limit queries are not eligible for index-free query execution if there is
            // a potential that an older document from cache now sorts before a document
            // that was previously part of the limit. This, however, can only happen if
            // the document at the edge of the limit goes out of limit.
            // If a document that is not the limit boundary sorts differently,
            // the boundary of the limit itself did not change and documents from cache
            // will continue to be "rejected" by this boundary. Therefore, we can ignore
            // any modifications that don't affect the last document.
                    const i = "F" /* First */ === t ? e.last() : e.first();
            return !!i && (i.hasPendingWrites || i.version.compareTo(s) > 0);
        }
        Fn(t, e) {
            return N$1() <= LogLevel.DEBUG && k$1("QueryEngine", "Using full collection scan to execute query:", Re(e)), 
            this.On.getDocumentsMatchingQuery(t, e, it.min());
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Implements `LocalStore` interface.
     *
     * Note: some field defined in this class might have public access level, but
     * the class is not exported so they are only accessible from this module.
     * This is useful to implement optional features (like bundles) in free
     * functions, such that they are tree-shakeable.
     */
    class ar {
        constructor(
        /** Manages our in-memory or durable persistence. */
        t, e, n, s) {
            this.persistence = t, this.Bn = e, this.N = s, 
            /**
             * Maps a targetID to data about its target.
             *
             * PORTING NOTE: We are using an immutable data structure on Web to make re-runs
             * of `applyRemoteEvent()` idempotent.
             */
            this.Un = new dn(tt), 
            /** Maps a target to its targetID. */
            // TODO(wuandy): Evaluate if TargetId can be part of Target.
            this.qn = new Ki((t => Qt(t)), Gt), 
            /**
             * The read time of the last entry processed by `getNewDocumentChanges()`.
             *
             * PORTING NOTE: This is only used for multi-tab synchronization.
             */
            this.Kn = it.min(), this.In = t.getMutationQueue(n), this.jn = t.getRemoteDocumentCache(), 
            this.ze = t.getTargetCache(), this.Qn = new ir(this.jn, this.In, this.persistence.getIndexManager()), 
            this.Je = t.getBundleCache(), this.Bn.$n(this.Qn);
        }
        collectGarbage(t) {
            return this.persistence.runTransaction("Collect garbage", "readwrite-primary", (e => t.collect(e, this.Un)));
        }
    }

    function cr(
    /** Manages our in-memory or durable persistence. */
    t, e, n, s) {
        return new ar(t, e, n, s);
    }

    /**
     * Tells the LocalStore that the currently authenticated user has changed.
     *
     * In response the local store switches the mutation queue to the new user and
     * returns any resulting document changes.
     */
    // PORTING NOTE: Android and iOS only return the documents affected by the
    // change.
    async function ur(t, e) {
        const n = U$1(t);
        let s = n.In, i = n.Qn;
        const r = await n.persistence.runTransaction("Handle user change", "readonly", (t => {
            // Swap out the mutation queue, grabbing the pending mutation batches
            // before and after.
            let r;
            return n.In.getAllMutationBatches(t).next((o => (r = o, s = n.persistence.getMutationQueue(e), 
            // Recreate our LocalDocumentsView using the new
            // MutationQueue.
            i = new ir(n.jn, s, n.persistence.getIndexManager()), s.getAllMutationBatches(t)))).next((e => {
                const n = [], s = [];
                // Union the old/new changed keys.
                let o = Pn();
                for (const t of r) {
                    n.push(t.batchId);
                    for (const e of t.mutations) o = o.add(e.key);
                }
                for (const t of e) {
                    s.push(t.batchId);
                    for (const e of t.mutations) o = o.add(e.key);
                }
                // Return the set of all (potentially) changed documents and the list
                // of mutation batch IDs that were affected by change.
                            return i.bn(t, o).next((t => ({
                    Wn: t,
                    removedBatchIds: n,
                    addedBatchIds: s
                })));
            }));
        }));
        return n.In = s, n.Qn = i, n.Bn.$n(n.Qn), r;
    }

    /* Accepts locally generated Mutations and commit them to storage. */
    /**
     * Acknowledges the given batch.
     *
     * On the happy path when a batch is acknowledged, the local store will
     *
     *  + remove the batch from the mutation queue;
     *  + apply the changes to the remote document cache;
     *  + recalculate the latency compensated view implied by those changes (there
     *    may be mutations in the queue that affect the documents but haven't been
     *    acknowledged yet); and
     *  + give the changed documents back the sync engine
     *
     * @returns The resulting (modified) documents.
     */
    function hr(t, e) {
        const n = U$1(t);
        return n.persistence.runTransaction("Acknowledge batch", "readwrite-primary", (t => {
            const s = e.batch.keys(), i = n.jn.newChangeBuffer({
                trackRemovals: !0
            });
            return function(t, e, n, s) {
                const i = n.batch, r = i.keys();
                let o = Ks.resolve();
                return r.forEach((t => {
                    o = o.next((() => s.getEntry(e, t))).next((e => {
                        const r = n.docVersions.get(t);
                        L$1(null !== r), e.version.compareTo(r) < 0 && (i.applyToRemoteDocument(e, n), e.isValidDocument() && 
                        // We use the commitVersion as the readTime rather than the
                        // document's updateTime since the updateTime is not advanced
                        // for updates that do not modify the underlying document.
                        s.addEntry(e, n.commitVersion));
                    }));
                })), o.next((() => t.In.removeMutationBatch(e, i)));
            }
            /** Returns the local view of the documents affected by a mutation batch. */
            // PORTING NOTE: Multi-Tab only.
            (n, t, e, i).next((() => i.apply(t))).next((() => n.In.performConsistencyCheck(t))).next((() => n.Qn.bn(t, s)));
        }));
    }

    /**
     * Removes mutations from the MutationQueue for the specified batch;
     * LocalDocuments will be recalculated.
     *
     * @returns The resulting modified documents.
     */
    /**
     * Returns the last consistent snapshot processed (used by the RemoteStore to
     * determine whether to buffer incoming snapshots from the backend).
     */
    function lr(t) {
        const e = U$1(t);
        return e.persistence.runTransaction("Get last remote snapshot version", "readonly", (t => e.ze.getLastRemoteSnapshotVersion(t)));
    }

    /**
     * Updates the "ground-state" (remote) documents. We assume that the remote
     * event reflects any write batches that have been acknowledged or rejected
     * (i.e. we do not re-apply local mutations to updates from this event).
     *
     * LocalDocuments are re-calculated if there are remaining mutations in the
     * queue.
     */ function fr(t, e) {
        const n = U$1(t), s = e.snapshotVersion;
        let i = n.Un;
        return n.persistence.runTransaction("Apply remote event", "readwrite-primary", (t => {
            const r = n.jn.newChangeBuffer({
                trackRemovals: !0
            });
            // Reset newTargetDataByTargetMap in case this transaction gets re-run.
                    i = n.Un;
            const o = [];
            e.targetChanges.forEach(((e, r) => {
                const a = i.get(r);
                if (!a) return;
                // Only update the remote keys if the target is still active. This
                // ensures that we can persist the updated target data along with
                // the updated assignment.
                            o.push(n.ze.removeMatchingKeys(t, e.removedDocuments, r).next((() => n.ze.addMatchingKeys(t, e.addedDocuments, r))));
                const c = e.resumeToken;
                // Update the resume token if the change includes one.
                            if (c.approximateByteSize() > 0) {
                    const u = a.withResumeToken(c, s).withSequenceNumber(t.currentSequenceNumber);
                    i = i.insert(r, u), 
                    // Update the target data if there are target changes (or if
                    // sufficient time has passed since the last update).
                    /**
     * Returns true if the newTargetData should be persisted during an update of
     * an active target. TargetData should always be persisted when a target is
     * being released and should not call this function.
     *
     * While the target is active, TargetData updates can be omitted when nothing
     * about the target has changed except metadata like the resume token or
     * snapshot version. Occasionally it's worth the extra write to prevent these
     * values from getting too stale after a crash, but this doesn't have to be
     * too frequent.
     */
                    function(t, e, n) {
                        // Always persist target data if we don't already have a resume token.
                        if (L$1(e.resumeToken.approximateByteSize() > 0), 0 === t.resumeToken.approximateByteSize()) return !0;
                        // Don't allow resume token changes to be buffered indefinitely. This
                        // allows us to be reasonably up-to-date after a crash and avoids needing
                        // to loop over all active queries on shutdown. Especially in the browser
                        // we may not get time to do anything interesting while the current tab is
                        // closing.
                                            if (e.snapshotVersion.toMicroseconds() - t.snapshotVersion.toMicroseconds() >= 3e8) return !0;
                        // Otherwise if the only thing that has changed about a target is its resume
                        // token it's not worth persisting. Note that the RemoteStore keeps an
                        // in-memory view of the currently active targets which includes the current
                        // resume token, so stream failure or user changes will still use an
                        // up-to-date resume token regardless of what we do here.
                                            return n.addedDocuments.size + n.modifiedDocuments.size + n.removedDocuments.size > 0;
                    }
                    /**
     * Notifies local store of the changed views to locally pin documents.
     */ (a, u, e) && o.push(n.ze.updateTargetData(t, u));
                }
            }));
            let a = pn();
            // HACK: The only reason we allow a null snapshot version is so that we
            // can synthesize remote events when we get permission denied errors while
            // trying to resolve the state of a locally cached document that is in
            // limbo.
            if (e.documentUpdates.forEach(((s, i) => {
                e.resolvedLimboDocuments.has(s) && o.push(n.persistence.referenceDelegate.updateLimboDocument(t, s));
            })), 
            // Each loop iteration only affects its "own" doc, so it's safe to get all the remote
            // documents in advance in a single call.
            o.push(dr(t, r, e.documentUpdates, s, void 0).next((t => {
                a = t;
            }))), !s.isEqual(it.min())) {
                const e = n.ze.getLastRemoteSnapshotVersion(t).next((e => n.ze.setTargetsMetadata(t, t.currentSequenceNumber, s)));
                o.push(e);
            }
            return Ks.waitFor(o).next((() => r.apply(t))).next((() => n.Qn.vn(t, a))).next((() => a));
        })).then((t => (n.Un = i, t)));
    }

    /**
     * Populates document change buffer with documents from backend or a bundle.
     * Returns the document changes resulting from applying those documents.
     *
     * @param txn - Transaction to use to read existing documents from storage.
     * @param documentBuffer - Document buffer to collect the resulted changes to be
     *        applied to storage.
     * @param documents - Documents to be applied.
     * @param globalVersion - A `SnapshotVersion` representing the read time if all
     *        documents have the same read time.
     * @param documentVersions - A DocumentKey-to-SnapshotVersion map if documents
     *        have their own read time.
     *
     * Note: this function will use `documentVersions` if it is defined;
     * when it is not defined, resorts to `globalVersion`.
     */ function dr(t, e, n, s, 
    // TODO(wuandy): We could add `readTime` to MaybeDocument instead to remove
    // this parameter.
    i) {
        let r = Pn();
        return n.forEach((t => r = r.add(t))), e.getEntries(t, r).next((t => {
            let r = pn();
            return n.forEach(((n, o) => {
                const a = t.get(n), c = (null == i ? void 0 : i.get(n)) || s;
                // Note: The order of the steps below is important, since we want
                // to ensure that rejected limbo resolutions (which fabricate
                // NoDocuments with SnapshotVersion.min()) never add documents to
                // cache.
                o.isNoDocument() && o.version.isEqual(it.min()) ? (
                // NoDocuments with SnapshotVersion.min() are used in manufactured
                // events. We remove these documents from cache since we lost
                // access.
                e.removeEntry(n, c), r = r.insert(n, o)) : !a.isValidDocument() || o.version.compareTo(a.version) > 0 || 0 === o.version.compareTo(a.version) && a.hasPendingWrites ? (e.addEntry(o, c), 
                r = r.insert(n, o)) : k$1("LocalStore", "Ignoring outdated watch update for ", n, ". Current version:", a.version, " Watch version:", o.version);
            })), r;
        }));
    }

    /**
     * Gets the mutation batch after the passed in batchId in the mutation queue
     * or null if empty.
     * @param afterBatchId - If provided, the batch to search after.
     * @returns The next mutation or null if there wasn't one.
     */
    function wr(t, e) {
        const n = U$1(t);
        return n.persistence.runTransaction("Get next mutation batch", "readonly", (t => (void 0 === e && (e = -1), 
        n.In.getNextMutationBatchAfterBatchId(t, e))));
    }

    /**
     * Reads the current value of a Document with a given key or null if not
     * found - used for testing.
     */
    /**
     * Assigns the given target an internal ID so that its results can be pinned so
     * they don't get GC'd. A target must be allocated in the local store before
     * the store can be used to manage its view.
     *
     * Allocating an already allocated `Target` will return the existing `TargetData`
     * for that `Target`.
     */
    function _r(t, e) {
        const n = U$1(t);
        return n.persistence.runTransaction("Allocate target", "readwrite", (t => {
            let s;
            return n.ze.getTargetData(t, e).next((i => i ? (
            // This target has been listened to previously, so reuse the
            // previous targetID.
            // TODO(mcg): freshen last accessed date?
            s = i, Ks.resolve(s)) : n.ze.allocateTargetId(t).next((i => (s = new si(e, i, 0 /* Listen */ , t.currentSequenceNumber), 
            n.ze.addTargetData(t, s).next((() => s)))))));
        })).then((t => {
            // If Multi-Tab is enabled, the existing target data may be newer than
            // the in-memory data
            const s = n.Un.get(t.targetId);
            return (null === s || t.snapshotVersion.compareTo(s.snapshotVersion) > 0) && (n.Un = n.Un.insert(t.targetId, t), 
            n.qn.set(e, t.targetId)), t;
        }));
    }

    /**
     * Returns the TargetData as seen by the LocalStore, including updates that may
     * have not yet been persisted to the TargetCache.
     */
    // Visible for testing.
    /**
     * Unpins all the documents associated with the given target. If
     * `keepPersistedTargetData` is set to false and Eager GC enabled, the method
     * directly removes the associated target data from the target cache.
     *
     * Releasing a non-existing `Target` is a no-op.
     */
    // PORTING NOTE: `keepPersistedTargetData` is multi-tab only.
    async function mr(t, e, n) {
        const s = U$1(t), i = s.Un.get(e), r = n ? "readwrite" : "readwrite-primary";
        try {
            n || await s.persistence.runTransaction("Release target", r, (t => s.persistence.referenceDelegate.removeTarget(t, i)));
        } catch (t) {
            if (!zs(t)) throw t;
            // All `releaseTarget` does is record the final metadata state for the
            // target, but we've been recording this periodically during target
            // activity. If we lose this write this could cause a very slight
            // difference in the order of target deletion during GC, but we
            // don't define exact LRU semantics so this is acceptable.
            k$1("LocalStore", `Failed to update sequence numbers for target ${e}: ${t}`);
        }
        s.Un = s.Un.remove(e), s.qn.delete(i.target);
    }

    /**
     * Runs the specified query against the local store and returns the results,
     * potentially taking advantage of query data from previous executions (such
     * as the set of remote keys).
     *
     * @param usePreviousResults - Whether results from previous executions can
     * be used to optimize this query execution.
     */ function gr(t, e, n) {
        const s = U$1(t);
        let i = it.min(), r = Pn();
        return s.persistence.runTransaction("Execute query", "readonly", (t => function(t, e, n) {
            const s = U$1(t), i = s.qn.get(n);
            return void 0 !== i ? Ks.resolve(s.Un.get(i)) : s.ze.getTargetData(e, n);
        }(s, t, Ee(e)).next((e => {
            if (e) return i = e.lastLimboFreeSnapshotVersion, s.ze.getMatchingKeysForTargetId(t, e.targetId).next((t => {
                r = t;
            }));
        })).next((() => s.Bn.getDocumentsMatchingQuery(t, e, n ? i : it.min(), n ? r : Pn()))).next((t => ({
            documents: t,
            Gn: r
        })))));
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class Ar {
        constructor(t) {
            this.N = t, this.Yn = new Map, this.Xn = new Map;
        }
        getBundleMetadata(t, e) {
            return Ks.resolve(this.Yn.get(e));
        }
        saveBundleMetadata(t, e) {
            /** Decodes a BundleMetadata proto into a BundleMetadata object. */
            var n;
            return this.Yn.set(e.id, {
                id: (n = e).id,
                version: n.version,
                createTime: Kn(n.createTime)
            }), Ks.resolve();
        }
        getNamedQuery(t, e) {
            return Ks.resolve(this.Xn.get(e));
        }
        saveNamedQuery(t, e) {
            return this.Xn.set(e.name, function(t) {
                return {
                    name: t.name,
                    query: wi(t.bundledQuery),
                    readTime: Kn(t.readTime)
                };
            }(e)), Ks.resolve();
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A collection of references to a document from some kind of numbered entity
     * (either a target ID or batch ID). As references are added to or removed from
     * the set corresponding events are emitted to a registered garbage collector.
     *
     * Each reference is represented by a DocumentReference object. Each of them
     * contains enough information to uniquely identify the reference. They are all
     * stored primarily in a set sorted by key. A document is considered garbage if
     * there's no references in that set (this can be efficiently checked thanks to
     * sorting by key).
     *
     * ReferenceSet also keeps a secondary set that contains references sorted by
     * IDs. This one is used to efficiently implement removal of all references by
     * some target ID.
     */ class Rr {
        constructor() {
            // A set of outstanding references to a document sorted by key.
            this.Zn = new mn(Pr.ts), 
            // A set of outstanding references to a document sorted by target id.
            this.es = new mn(Pr.ns);
        }
        /** Returns true if the reference set contains no references. */    isEmpty() {
            return this.Zn.isEmpty();
        }
        /** Adds a reference to the given document key for the given ID. */    addReference(t, e) {
            const n = new Pr(t, e);
            this.Zn = this.Zn.add(n), this.es = this.es.add(n);
        }
        /** Add references to the given document keys for the given ID. */    ss(t, e) {
            t.forEach((t => this.addReference(t, e)));
        }
        /**
         * Removes a reference to the given document key for the given
         * ID.
         */    removeReference(t, e) {
            this.rs(new Pr(t, e));
        }
        os(t, e) {
            t.forEach((t => this.removeReference(t, e)));
        }
        /**
         * Clears all references with a given ID. Calls removeRef() for each key
         * removed.
         */    cs(t) {
            const e = new Pt(new ut([])), n = new Pr(e, t), s = new Pr(e, t + 1), i = [];
            return this.es.forEachInRange([ n, s ], (t => {
                this.rs(t), i.push(t.key);
            })), i;
        }
        us() {
            this.Zn.forEach((t => this.rs(t)));
        }
        rs(t) {
            this.Zn = this.Zn.delete(t), this.es = this.es.delete(t);
        }
        hs(t) {
            const e = new Pt(new ut([])), n = new Pr(e, t), s = new Pr(e, t + 1);
            let i = Pn();
            return this.es.forEachInRange([ n, s ], (t => {
                i = i.add(t.key);
            })), i;
        }
        containsKey(t) {
            const e = new Pr(t, 0), n = this.Zn.firstAfterOrEqual(e);
            return null !== n && t.isEqual(n.key);
        }
    }

    class Pr {
        constructor(t, e) {
            this.key = t, this.ls = e;
        }
        /** Compare by key then by ID */    static ts(t, e) {
            return Pt.comparator(t.key, e.key) || tt(t.ls, e.ls);
        }
        /** Compare by ID then by key */    static ns(t, e) {
            return tt(t.ls, e.ls) || Pt.comparator(t.key, e.key);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class br {
        constructor(t, e) {
            this.Ht = t, this.referenceDelegate = e, 
            /**
             * The set of all mutations that have been sent but not yet been applied to
             * the backend.
             */
            this.In = [], 
            /** Next value to use when assigning sequential IDs to each mutation batch. */
            this.fs = 1, 
            /** An ordered mapping between documents and the mutations batch IDs. */
            this.ds = new mn(Pr.ts);
        }
        checkEmpty(t) {
            return Ks.resolve(0 === this.In.length);
        }
        addMutationBatch(t, e, n, s) {
            const i = this.fs;
            this.fs++, this.In.length > 0 && this.In[this.In.length - 1];
            const r = new ei(i, e, n, s);
            this.In.push(r);
            // Track references by document key and index collection parents.
            for (const e of s) this.ds = this.ds.add(new Pr(e.key, i)), this.Ht.addToCollectionParentIndex(t, e.key.path.popLast());
            return Ks.resolve(r);
        }
        lookupMutationBatch(t, e) {
            return Ks.resolve(this.ws(e));
        }
        getNextMutationBatchAfterBatchId(t, e) {
            const n = e + 1, s = this._s(n), i = s < 0 ? 0 : s;
            // The requested batchId may still be out of range so normalize it to the
            // start of the queue.
                    return Ks.resolve(this.In.length > i ? this.In[i] : null);
        }
        getHighestUnacknowledgedBatchId() {
            return Ks.resolve(0 === this.In.length ? -1 : this.fs - 1);
        }
        getAllMutationBatches(t) {
            return Ks.resolve(this.In.slice());
        }
        getAllMutationBatchesAffectingDocumentKey(t, e) {
            const n = new Pr(e, 0), s = new Pr(e, Number.POSITIVE_INFINITY), i = [];
            return this.ds.forEachInRange([ n, s ], (t => {
                const e = this.ws(t.ls);
                i.push(e);
            })), Ks.resolve(i);
        }
        getAllMutationBatchesAffectingDocumentKeys(t, e) {
            let n = new mn(tt);
            return e.forEach((t => {
                const e = new Pr(t, 0), s = new Pr(t, Number.POSITIVE_INFINITY);
                this.ds.forEachInRange([ e, s ], (t => {
                    n = n.add(t.ls);
                }));
            })), Ks.resolve(this.gs(n));
        }
        getAllMutationBatchesAffectingQuery(t, e) {
            // Use the query path as a prefix for testing if a document matches the
            // query.
            const n = e.path, s = n.length + 1;
            // Construct a document reference for actually scanning the index. Unlike
            // the prefix the document key in this reference must have an even number of
            // segments. The empty segment can be used a suffix of the query path
            // because it precedes all other segments in an ordered traversal.
            let i = n;
            Pt.isDocumentKey(i) || (i = i.child(""));
            const r = new Pr(new Pt(i), 0);
            // Find unique batchIDs referenced by all documents potentially matching the
            // query.
                    let o = new mn(tt);
            return this.ds.forEachWhile((t => {
                const e = t.key.path;
                return !!n.isPrefixOf(e) && (
                // Rows with document keys more than one segment longer than the query
                // path can't be matches. For example, a query on 'rooms' can't match
                // the document /rooms/abc/messages/xyx.
                // TODO(mcg): we'll need a different scanner when we implement
                // ancestor queries.
                e.length === s && (o = o.add(t.ls)), !0);
            }), r), Ks.resolve(this.gs(o));
        }
        gs(t) {
            // Construct an array of matching batches, sorted by batchID to ensure that
            // multiple mutations affecting the same document key are applied in order.
            const e = [];
            return t.forEach((t => {
                const n = this.ws(t);
                null !== n && e.push(n);
            })), e;
        }
        removeMutationBatch(t, e) {
            L$1(0 === this.ys(e.batchId, "removed")), this.In.shift();
            let n = this.ds;
            return Ks.forEach(e.mutations, (s => {
                const i = new Pr(s.key, e.batchId);
                return n = n.delete(i), this.referenceDelegate.markPotentiallyOrphaned(t, s.key);
            })).next((() => {
                this.ds = n;
            }));
        }
        te(t) {
            // No-op since the memory mutation queue does not maintain a separate cache.
        }
        containsKey(t, e) {
            const n = new Pr(e, 0), s = this.ds.firstAfterOrEqual(n);
            return Ks.resolve(e.isEqual(s && s.key));
        }
        performConsistencyCheck(t) {
            return this.In.length, Ks.resolve();
        }
        /**
         * Finds the index of the given batchId in the mutation queue and asserts that
         * the resulting index is within the bounds of the queue.
         *
         * @param batchId - The batchId to search for
         * @param action - A description of what the caller is doing, phrased in passive
         * form (e.g. "acknowledged" in a routine that acknowledges batches).
         */    ys(t, e) {
            return this._s(t);
        }
        /**
         * Finds the index of the given batchId in the mutation queue. This operation
         * is O(1).
         *
         * @returns The computed index of the batch with the given batchId, based on
         * the state of the queue. Note this index can be negative if the requested
         * batchId has already been remvoed from the queue or past the end of the
         * queue if the batchId is larger than the last added batch.
         */    _s(t) {
            if (0 === this.In.length) 
            // As an index this is past the end of the queue
            return 0;
            // Examine the front of the queue to figure out the difference between the
            // batchId and indexes in the array. Note that since the queue is ordered
            // by batchId, if the first batch has a larger batchId then the requested
            // batchId doesn't exist in the queue.
                    return t - this.In[0].batchId;
        }
        /**
         * A version of lookupMutationBatch that doesn't return a promise, this makes
         * other functions that uses this code easier to read and more efficent.
         */    ws(t) {
            const e = this._s(t);
            if (e < 0 || e >= this.In.length) return null;
            return this.In[e];
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * The memory-only RemoteDocumentCache for IndexedDb. To construct, invoke
     * `newMemoryRemoteDocumentCache()`.
     */
    class vr {
        /**
         * @param sizer - Used to assess the size of a document. For eager GC, this is
         * expected to just return 0 to avoid unnecessarily doing the work of
         * calculating the size.
         */
        constructor(t, e) {
            this.Ht = t, this.ps = e, 
            /** Underlying cache of documents and their read times. */
            this.docs = new dn(Pt.comparator), 
            /** Size of all cached documents. */
            this.size = 0;
        }
        /**
         * Adds the supplied entry to the cache and updates the cache size as appropriate.
         *
         * All calls of `addEntry`  are required to go through the RemoteDocumentChangeBuffer
         * returned by `newChangeBuffer()`.
         */    addEntry(t, e, n) {
            const s = e.key, i = this.docs.get(s), r = i ? i.size : 0, o = this.ps(e);
            return this.docs = this.docs.insert(s, {
                document: e.clone(),
                size: o,
                readTime: n
            }), this.size += o - r, this.Ht.addToCollectionParentIndex(t, s.path.popLast());
        }
        /**
         * Removes the specified entry from the cache and updates the cache size as appropriate.
         *
         * All calls of `removeEntry` are required to go through the RemoteDocumentChangeBuffer
         * returned by `newChangeBuffer()`.
         */    removeEntry(t) {
            const e = this.docs.get(t);
            e && (this.docs = this.docs.remove(t), this.size -= e.size);
        }
        getEntry(t, e) {
            const n = this.docs.get(e);
            return Ks.resolve(n ? n.document.clone() : qt.newInvalidDocument(e));
        }
        getEntries(t, e) {
            let n = pn();
            return e.forEach((t => {
                const e = this.docs.get(t);
                n = n.insert(t, e ? e.document.clone() : qt.newInvalidDocument(t));
            })), Ks.resolve(n);
        }
        getDocumentsMatchingQuery(t, e, n) {
            let s = pn();
            // Documents are ordered by key, so we can use a prefix scan to narrow down
            // the documents we need to match the query against.
                    const i = new Pt(e.path.child("")), r = this.docs.getIteratorFrom(i);
            for (;r.hasNext(); ) {
                const {key: t, value: {document: i, readTime: o}} = r.getNext();
                if (!e.path.isPrefixOf(t.path)) break;
                o.compareTo(n) <= 0 || Pe(e, i) && (s = s.insert(i.key, i.clone()));
            }
            return Ks.resolve(s);
        }
        Es(t, e) {
            return Ks.forEach(this.docs, (t => e(t)));
        }
        newChangeBuffer(t) {
            // `trackRemovals` is ignores since the MemoryRemoteDocumentCache keeps
            // a separate changelog and does not need special handling for removals.
            return new Vr(this);
        }
        getSize(t) {
            return Ks.resolve(this.size);
        }
    }

    /**
     * Creates a new memory-only RemoteDocumentCache.
     *
     * @param indexManager - A class that manages collection group indices.
     * @param sizer - Used to assess the size of a document. For eager GC, this is
     * expected to just return 0 to avoid unnecessarily doing the work of
     * calculating the size.
     */
    /**
     * Handles the details of adding and updating documents in the MemoryRemoteDocumentCache.
     */
    class Vr extends ji {
        constructor(t) {
            super(), this.Se = t;
        }
        applyChanges(t) {
            const e = [];
            return this.changes.forEach(((n, s) => {
                s.document.isValidDocument() ? e.push(this.Se.addEntry(t, s.document, this.getReadTime(n))) : this.Se.removeEntry(n);
            })), Ks.waitFor(e);
        }
        getFromCache(t, e) {
            return this.Se.getEntry(t, e);
        }
        getAllFromCache(t, e) {
            return this.Se.getEntries(t, e);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class Sr {
        constructor(t) {
            this.persistence = t, 
            /**
             * Maps a target to the data about that target
             */
            this.Ts = new Ki((t => Qt(t)), Gt), 
            /** The last received snapshot version. */
            this.lastRemoteSnapshotVersion = it.min(), 
            /** The highest numbered target ID encountered. */
            this.highestTargetId = 0, 
            /** The highest sequence number encountered. */
            this.Is = 0, 
            /**
             * A ordered bidirectional mapping between documents and the remote target
             * IDs.
             */
            this.As = new Rr, this.targetCount = 0, this.Rs = Ci.se();
        }
        forEachTarget(t, e) {
            return this.Ts.forEach(((t, n) => e(n))), Ks.resolve();
        }
        getLastRemoteSnapshotVersion(t) {
            return Ks.resolve(this.lastRemoteSnapshotVersion);
        }
        getHighestSequenceNumber(t) {
            return Ks.resolve(this.Is);
        }
        allocateTargetId(t) {
            return this.highestTargetId = this.Rs.next(), Ks.resolve(this.highestTargetId);
        }
        setTargetsMetadata(t, e, n) {
            return n && (this.lastRemoteSnapshotVersion = n), e > this.Is && (this.Is = e), 
            Ks.resolve();
        }
        ae(t) {
            this.Ts.set(t.target, t);
            const e = t.targetId;
            e > this.highestTargetId && (this.Rs = new Ci(e), this.highestTargetId = e), t.sequenceNumber > this.Is && (this.Is = t.sequenceNumber);
        }
        addTargetData(t, e) {
            return this.ae(e), this.targetCount += 1, Ks.resolve();
        }
        updateTargetData(t, e) {
            return this.ae(e), Ks.resolve();
        }
        removeTargetData(t, e) {
            return this.Ts.delete(e.target), this.As.cs(e.targetId), this.targetCount -= 1, 
            Ks.resolve();
        }
        removeTargets(t, e, n) {
            let s = 0;
            const i = [];
            return this.Ts.forEach(((r, o) => {
                o.sequenceNumber <= e && null === n.get(o.targetId) && (this.Ts.delete(r), i.push(this.removeMatchingKeysForTargetId(t, o.targetId)), 
                s++);
            })), Ks.waitFor(i).next((() => s));
        }
        getTargetCount(t) {
            return Ks.resolve(this.targetCount);
        }
        getTargetData(t, e) {
            const n = this.Ts.get(e) || null;
            return Ks.resolve(n);
        }
        addMatchingKeys(t, e, n) {
            return this.As.ss(e, n), Ks.resolve();
        }
        removeMatchingKeys(t, e, n) {
            this.As.os(e, n);
            const s = this.persistence.referenceDelegate, i = [];
            return s && e.forEach((e => {
                i.push(s.markPotentiallyOrphaned(t, e));
            })), Ks.waitFor(i);
        }
        removeMatchingKeysForTargetId(t, e) {
            return this.As.cs(e), Ks.resolve();
        }
        getMatchingKeysForTargetId(t, e) {
            const n = this.As.hs(e);
            return Ks.resolve(n);
        }
        containsKey(t, e) {
            return Ks.resolve(this.As.containsKey(e));
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A memory-backed instance of Persistence. Data is stored only in RAM and
     * not persisted across sessions.
     */
    class Dr {
        /**
         * The constructor accepts a factory for creating a reference delegate. This
         * allows both the delegate and this instance to have strong references to
         * each other without having nullable fields that would then need to be
         * checked or asserted on every access.
         */
        constructor(t, e) {
            this.Ps = {}, this.Le = new Y$1(0), this.Be = !1, this.Be = !0, this.referenceDelegate = t(this), 
            this.ze = new Sr(this);
            this.Ht = new yi, this.He = function(t, e) {
                return new vr(t, e);
            }(this.Ht, (t => this.referenceDelegate.bs(t))), this.N = new ii(e), this.Je = new Ar(this.N);
        }
        start() {
            return Promise.resolve();
        }
        shutdown() {
            // No durable state to ensure is closed on shutdown.
            return this.Be = !1, Promise.resolve();
        }
        get started() {
            return this.Be;
        }
        setDatabaseDeletedListener() {
            // No op.
        }
        setNetworkEnabled() {
            // No op.
        }
        getIndexManager() {
            return this.Ht;
        }
        getMutationQueue(t) {
            let e = this.Ps[t.toKey()];
            return e || (e = new br(this.Ht, this.referenceDelegate), this.Ps[t.toKey()] = e), 
            e;
        }
        getTargetCache() {
            return this.ze;
        }
        getRemoteDocumentCache() {
            return this.He;
        }
        getBundleCache() {
            return this.Je;
        }
        runTransaction(t, e, n) {
            k$1("MemoryPersistence", "Starting transaction:", t);
            const s = new Cr(this.Le.next());
            return this.referenceDelegate.vs(), n(s).next((t => this.referenceDelegate.Vs(s).next((() => t)))).toPromise().then((t => (s.raiseOnCommittedEvent(), 
            t)));
        }
        Ss(t, e) {
            return Ks.or(Object.values(this.Ps).map((n => () => n.containsKey(t, e))));
        }
    }

    /**
     * Memory persistence is not actually transactional, but future implementations
     * may have transaction-scoped state.
     */ class Cr extends qs {
        constructor(t) {
            super(), this.currentSequenceNumber = t;
        }
    }

    class Nr {
        constructor(t) {
            this.persistence = t, 
            /** Tracks all documents that are active in Query views. */
            this.Ds = new Rr, 
            /** The list of documents that are potentially GCed after each transaction. */
            this.Cs = null;
        }
        static Ns(t) {
            return new Nr(t);
        }
        get xs() {
            if (this.Cs) return this.Cs;
            throw M$1();
        }
        addReference(t, e, n) {
            return this.Ds.addReference(n, e), this.xs.delete(n.toString()), Ks.resolve();
        }
        removeReference(t, e, n) {
            return this.Ds.removeReference(n, e), this.xs.add(n.toString()), Ks.resolve();
        }
        markPotentiallyOrphaned(t, e) {
            return this.xs.add(e.toString()), Ks.resolve();
        }
        removeTarget(t, e) {
            this.Ds.cs(e.targetId).forEach((t => this.xs.add(t.toString())));
            const n = this.persistence.getTargetCache();
            return n.getMatchingKeysForTargetId(t, e.targetId).next((t => {
                t.forEach((t => this.xs.add(t.toString())));
            })).next((() => n.removeTargetData(t, e)));
        }
        vs() {
            this.Cs = new Set;
        }
        Vs(t) {
            // Remove newly orphaned documents.
            const e = this.persistence.getRemoteDocumentCache().newChangeBuffer();
            return Ks.forEach(this.xs, (n => {
                const s = Pt.fromPath(n);
                return this.ks(t, s).next((t => {
                    t || e.removeEntry(s);
                }));
            })).next((() => (this.Cs = null, e.apply(t))));
        }
        updateLimboDocument(t, e) {
            return this.ks(t, e).next((t => {
                t ? this.xs.delete(e.toString()) : this.xs.add(e.toString());
            }));
        }
        bs(t) {
            // For eager GC, we don't care about the document size, there are no size thresholds.
            return 0;
        }
        ks(t, e) {
            return Ks.or([ () => Ks.resolve(this.Ds.containsKey(e)), () => this.persistence.getTargetCache().containsKey(t, e), () => this.persistence.Ss(t, e) ]);
        }
    }

    /**
     * Metadata state of the local client. Unlike `RemoteClientState`, this class is
     * mutable and keeps track of all pending mutations, which allows us to
     * update the range of pending mutation batch IDs as new mutations are added or
     * removed.
     *
     * The data in `LocalClientState` is not read from WebStorage and instead
     * updated via its instance methods. The updated state can be serialized via
     * `toWebStorageJSON()`.
     */
    // Visible for testing.
    class Br {
        constructor() {
            this.activeTargetIds = vn();
        }
        Fs(t) {
            this.activeTargetIds = this.activeTargetIds.add(t);
        }
        Ms(t) {
            this.activeTargetIds = this.activeTargetIds.delete(t);
        }
        /**
         * Converts this entry into a JSON-encoded format we can use for WebStorage.
         * Does not encode `clientId` as it is part of the key in WebStorage.
         */    Os() {
            const t = {
                activeTargetIds: this.activeTargetIds.toArray(),
                updateTimeMs: Date.now()
            };
            return JSON.stringify(t);
        }
    }

    class qr {
        constructor() {
            this.yi = new Br, this.pi = {}, this.onlineStateHandler = null, this.sequenceNumberHandler = null;
        }
        addPendingMutation(t) {
            // No op.
        }
        updateMutationState(t, e, n) {
            // No op.
        }
        addLocalQueryTarget(t) {
            return this.yi.Fs(t), this.pi[t] || "not-current";
        }
        updateQueryState(t, e, n) {
            this.pi[t] = e;
        }
        removeLocalQueryTarget(t) {
            this.yi.Ms(t);
        }
        isLocalQueryTarget(t) {
            return this.yi.activeTargetIds.has(t);
        }
        clearQueryState(t) {
            delete this.pi[t];
        }
        getAllActiveQueryTargets() {
            return this.yi.activeTargetIds;
        }
        isActiveQueryTarget(t) {
            return this.yi.activeTargetIds.has(t);
        }
        start() {
            return this.yi = new Br, Promise.resolve();
        }
        handleUserChange(t, e, n) {
            // No op.
        }
        setOnlineState(t) {
            // No op.
        }
        shutdown() {}
        writeSequenceNumber(t) {}
        notifyBundleLoaded() {
            // No op.
        }
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class Kr {
        Ei(t) {
            // No-op.
        }
        shutdown() {
            // No-op.
        }
    }

    /**
     * @license
     * Copyright 2019 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    // References to `window` are guarded by BrowserConnectivityMonitor.isAvailable()
    /* eslint-disable no-restricted-globals */
    /**
     * Browser implementation of ConnectivityMonitor.
     */
    class jr {
        constructor() {
            this.Ti = () => this.Ii(), this.Ai = () => this.Ri(), this.Pi = [], this.bi();
        }
        Ei(t) {
            this.Pi.push(t);
        }
        shutdown() {
            window.removeEventListener("online", this.Ti), window.removeEventListener("offline", this.Ai);
        }
        bi() {
            window.addEventListener("online", this.Ti), window.addEventListener("offline", this.Ai);
        }
        Ii() {
            k$1("ConnectivityMonitor", "Network connectivity changed: AVAILABLE");
            for (const t of this.Pi) t(0 /* AVAILABLE */);
        }
        Ri() {
            k$1("ConnectivityMonitor", "Network connectivity changed: UNAVAILABLE");
            for (const t of this.Pi) t(1 /* UNAVAILABLE */);
        }
        // TODO(chenbrian): Consider passing in window either into this component or
        // here for testing via FakeWindow.
        /** Checks that all used attributes of window are available. */
        static Pt() {
            return "undefined" != typeof window && void 0 !== window.addEventListener && void 0 !== window.removeEventListener;
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ const Qr = {
        BatchGetDocuments: "batchGet",
        Commit: "commit",
        RunQuery: "runQuery"
    };

    /**
     * Maps RPC names to the corresponding REST endpoint name.
     *
     * We use array notation to avoid mangling.
     */
    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Provides a simple helper class that implements the Stream interface to
     * bridge to other implementations that are streams but do not implement the
     * interface. The stream callbacks are invoked with the callOn... methods.
     */
    class Wr {
        constructor(t) {
            this.vi = t.vi, this.Vi = t.Vi;
        }
        Si(t) {
            this.Di = t;
        }
        Ci(t) {
            this.Ni = t;
        }
        onMessage(t) {
            this.xi = t;
        }
        close() {
            this.Vi();
        }
        send(t) {
            this.vi(t);
        }
        ki() {
            this.Di();
        }
        $i(t) {
            this.Ni(t);
        }
        Oi(t) {
            this.xi(t);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class Gr extends 
    /**
     * Base class for all Rest-based connections to the backend (WebChannel and
     * HTTP).
     */
    class {
        constructor(t) {
            this.databaseInfo = t, this.databaseId = t.databaseId;
            const e = t.ssl ? "https" : "http";
            this.Fi = e + "://" + t.host, this.Mi = "projects/" + this.databaseId.projectId + "/databases/" + this.databaseId.database + "/documents";
        }
        Li(t, e, n, s) {
            const i = this.Bi(t, e);
            k$1("RestConnection", "Sending: ", i, n);
            const r = {};
            return this.Ui(r, s), this.qi(t, i, r, n).then((t => (k$1("RestConnection", "Received: ", t), 
            t)), (e => {
                throw O$1("RestConnection", `${t} failed with error: `, e, "url: ", i, "request:", n), 
                e;
            }));
        }
        Ki(t, e, n, s) {
            // The REST API automatically aggregates all of the streamed results, so we
            // can just use the normal invoke() method.
            return this.Li(t, e, n, s);
        }
        /**
         * Modifies the headers for a request, adding any authorization token if
         * present and any additional headers for the request.
         */    Ui(t, e) {
            if (t["X-Goog-Api-Client"] = "gl-js/ fire/" + D$1, 
            // Content-Type: text/plain will avoid preflight requests which might
            // mess with CORS and redirects by proxies. If we add custom headers
            // we will need to change this code to potentially use the $httpOverwrite
            // parameter supported by ESF to avoid triggering preflight requests.
            t["Content-Type"] = "text/plain", this.databaseInfo.appId && (t["X-Firebase-GMPID"] = this.databaseInfo.appId), 
            e) for (const n in e.authHeaders) e.authHeaders.hasOwnProperty(n) && (t[n] = e.authHeaders[n]);
        }
        Bi(t, e) {
            const n = Qr[t];
            return `${this.Fi}/v1/${e}:${n}`;
        }
    } {
        constructor(t) {
            super(t), this.forceLongPolling = t.forceLongPolling, this.autoDetectLongPolling = t.autoDetectLongPolling, 
            this.useFetchStreams = t.useFetchStreams;
        }
        qi(t, e, n, s) {
            return new Promise(((i, r) => {
                const o = new XhrIo;
                o.listenOnce(EventType.COMPLETE, (() => {
                    try {
                        switch (o.getLastErrorCode()) {
                          case ErrorCode.NO_ERROR:
                            const e = o.getResponseJson();
                            k$1("Connection", "XHR received:", JSON.stringify(e)), i(e);
                            break;

                          case ErrorCode.TIMEOUT:
                            k$1("Connection", 'RPC "' + t + '" timed out'), r(new K$1(q$1.DEADLINE_EXCEEDED, "Request time out"));
                            break;

                          case ErrorCode.HTTP_ERROR:
                            const n = o.getStatus();
                            if (k$1("Connection", 'RPC "' + t + '" failed with status:', n, "response text:", o.getResponseText()), 
                            n > 0) {
                                const t = o.getResponseJson().error;
                                if (t && t.status && t.message) {
                                    const e = function(t) {
                                        const e = t.toLowerCase().replace(/_/g, "-");
                                        return Object.values(q$1).indexOf(e) >= 0 ? e : q$1.UNKNOWN;
                                    }(t.status);
                                    r(new K$1(e, t.message));
                                } else r(new K$1(q$1.UNKNOWN, "Server responded with status " + o.getStatus()));
                            } else 
                            // If we received an HTTP_ERROR but there's no status code,
                            // it's most probably a connection issue
                            r(new K$1(q$1.UNAVAILABLE, "Connection failed."));
                            break;

                          default:
                            M$1();
                        }
                    } finally {
                        k$1("Connection", 'RPC "' + t + '" completed.');
                    }
                }));
                const a = JSON.stringify(s);
                o.send(e, "POST", a, n, 15);
            }));
        }
        ji(t, e) {
            const n = [ this.Fi, "/", "google.firestore.v1.Firestore", "/", t, "/channel" ], s = createWebChannelTransport(), i = getStatEventTarget(), r = {
                // Required for backend stickiness, routing behavior is based on this
                // parameter.
                httpSessionIdParam: "gsessionid",
                initMessageHeaders: {},
                messageUrlParams: {
                    // This param is used to improve routing and project isolation by the
                    // backend and must be included in every request.
                    database: `projects/${this.databaseId.projectId}/databases/${this.databaseId.database}`
                },
                sendRawJson: !0,
                supportsCrossDomainXhr: !0,
                internalChannelParams: {
                    // Override the default timeout (randomized between 10-20 seconds) since
                    // a large write batch on a slow internet connection may take a long
                    // time to send to the backend. Rather than have WebChannel impose a
                    // tight timeout which could lead to infinite timeouts and retries, we
                    // set it very large (5-10 minutes) and rely on the browser's builtin
                    // timeouts to kick in if the request isn't working.
                    forwardChannelRequestTimeoutMs: 6e5
                },
                forceLongPolling: this.forceLongPolling,
                detectBufferingProxy: this.autoDetectLongPolling
            };
            this.useFetchStreams && (r.xmlHttpFactory = new FetchXmlHttpFactory({})), this.Ui(r.initMessageHeaders, e), 
            // Sending the custom headers we just added to request.initMessageHeaders
            // (Authorization, etc.) will trigger the browser to make a CORS preflight
            // request because the XHR will no longer meet the criteria for a "simple"
            // CORS request:
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#Simple_requests
            // Therefore to avoid the CORS preflight request (an extra network
            // roundtrip), we use the httpHeadersOverwriteParam option to specify that
            // the headers should instead be encoded into a special "$httpHeaders" query
            // parameter, which is recognized by the webchannel backend. This is
            // formally defined here:
            // https://github.com/google/closure-library/blob/b0e1815b13fb92a46d7c9b3c30de5d6a396a3245/closure/goog/net/rpc/httpcors.js#L32
            // TODO(b/145624756): There is a backend bug where $httpHeaders isn't respected if the request
            // doesn't have an Origin header. So we have to exclude a few browser environments that are
            // known to (sometimes) not include an Origin. See
            // https://github.com/firebase/firebase-js-sdk/issues/1491.
            isMobileCordova() || isReactNative() || isElectron() || isIE() || isUWP() || isBrowserExtension() || (r.httpHeadersOverwriteParam = "$httpHeaders");
            const o = n.join("");
            k$1("Connection", "Creating WebChannel: " + o, r);
            const a = s.createWebChannel(o, r);
            // WebChannel supports sending the first message with the handshake - saving
            // a network round trip. However, it will have to call send in the same
            // JS event loop as open. In order to enforce this, we delay actually
            // opening the WebChannel until send is called. Whether we have called
            // open is tracked with this variable.
                    let c = !1, u = !1;
            // A flag to determine whether the stream was closed (by us or through an
            // error/close event) to avoid delivering multiple close events or sending
            // on a closed stream
                    const h = new Wr({
                vi: t => {
                    u ? k$1("Connection", "Not sending because WebChannel is closed:", t) : (c || (k$1("Connection", "Opening WebChannel transport."), 
                    a.open(), c = !0), k$1("Connection", "WebChannel sending:", t), a.send(t));
                },
                Vi: () => a.close()
            }), g = (t, e, n) => {
                // TODO(dimond): closure typing seems broken because WebChannel does
                // not implement goog.events.Listenable
                t.listen(e, (t => {
                    try {
                        n(t);
                    } catch (t) {
                        setTimeout((() => {
                            throw t;
                        }), 0);
                    }
                }));
            };
            // Closure events are guarded and exceptions are swallowed, so catch any
            // exception and rethrow using a setTimeout so they become visible again.
            // Note that eventually this function could go away if we are confident
            // enough the code is exception free.
                    return g(a, WebChannel.EventType.OPEN, (() => {
                u || k$1("Connection", "WebChannel transport opened.");
            })), g(a, WebChannel.EventType.CLOSE, (() => {
                u || (u = !0, k$1("Connection", "WebChannel transport closed"), h.$i());
            })), g(a, WebChannel.EventType.ERROR, (t => {
                u || (u = !0, O$1("Connection", "WebChannel transport errored:", t), h.$i(new K$1(q$1.UNAVAILABLE, "The operation could not be completed")));
            })), g(a, WebChannel.EventType.MESSAGE, (t => {
                var e;
                if (!u) {
                    const n = t.data[0];
                    L$1(!!n);
                    // TODO(b/35143891): There is a bug in One Platform that caused errors
                    // (and only errors) to be wrapped in an extra array. To be forward
                    // compatible with the bug we need to check either condition. The latter
                    // can be removed once the fix has been rolled out.
                    // Use any because msgData.error is not typed.
                    const s = n, i = s.error || (null === (e = s[0]) || void 0 === e ? void 0 : e.error);
                    if (i) {
                        k$1("Connection", "WebChannel received error:", i);
                        // error.status will be a string like 'OK' or 'NOT_FOUND'.
                        const t = i.status;
                        let e = 
                        /**
     * Maps an error Code from a GRPC status identifier like 'NOT_FOUND'.
     *
     * @returns The Code equivalent to the given status string or undefined if
     *     there is no match.
     */
                        function(t) {
                            // lookup by string
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const e = un[t];
                            if (void 0 !== e) return fn(e);
                        }(t), n = i.message;
                        void 0 === e && (e = q$1.INTERNAL, n = "Unknown error status: " + t + " with message " + i.message), 
                        // Mark closed so no further events are propagated
                        u = !0, h.$i(new K$1(e, n)), a.close();
                    } else k$1("Connection", "WebChannel received:", n), h.Oi(n);
                }
            })), g(i, Event.STAT_EVENT, (t => {
                t.stat === Stat.PROXY ? k$1("Connection", "Detected buffering proxy") : t.stat === Stat.NOPROXY && k$1("Connection", "Detected no buffering proxy");
            })), setTimeout((() => {
                // Technically we could/should wait for the WebChannel opened event,
                // but because we want to send the first message with the WebChannel
                // handshake we pretend the channel opened here (asynchronously), and
                // then delay the actual open until the first message is sent.
                h.ki();
            }), 0), h;
        }
    }

    /** The Platform's 'document' implementation or null if not available. */ function Hr() {
        // `document` is not always available, e.g. in ReactNative and WebWorkers.
        // eslint-disable-next-line no-restricted-globals
        return "undefined" != typeof document ? document : null;
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ function Jr(t) {
        return new Ln(t, /* useProto3Json= */ !0);
    }

    /**
     * An instance of the Platform's 'TextEncoder' implementation.
     */
    /**
     * A helper for running delayed tasks following an exponential backoff curve
     * between attempts.
     *
     * Each delay is made up of a "base" delay which follows the exponential
     * backoff curve, and a +/- 50% "jitter" that is calculated and added to the
     * base delay. This prevents clients from accidentally synchronizing their
     * delays causing spikes of load to the backend.
     */
    class Yr {
        constructor(
        /**
         * The AsyncQueue to run backoff operations on.
         */
        t, 
        /**
         * The ID to use when scheduling backoff operations on the AsyncQueue.
         */
        e, 
        /**
         * The initial delay (used as the base delay on the first retry attempt).
         * Note that jitter will still be applied, so the actual delay could be as
         * little as 0.5*initialDelayMs.
         */
        n = 1e3
        /**
         * The multiplier to use to determine the extended base delay after each
         * attempt.
         */ , s = 1.5
        /**
         * The maximum base delay after which no further backoff is performed.
         * Note that jitter will still be applied, so the actual delay could be as
         * much as 1.5*maxDelayMs.
         */ , i = 6e4) {
            this.Oe = t, this.timerId = e, this.Qi = n, this.Wi = s, this.Gi = i, this.zi = 0, 
            this.Hi = null, 
            /** The last backoff attempt, as epoch milliseconds. */
            this.Ji = Date.now(), this.reset();
        }
        /**
         * Resets the backoff delay.
         *
         * The very next backoffAndWait() will have no delay. If it is called again
         * (i.e. due to an error), initialDelayMs (plus jitter) will be used, and
         * subsequent ones will increase according to the backoffFactor.
         */    reset() {
            this.zi = 0;
        }
        /**
         * Resets the backoff delay to the maximum delay (e.g. for use after a
         * RESOURCE_EXHAUSTED error).
         */    Yi() {
            this.zi = this.Gi;
        }
        /**
         * Returns a promise that resolves after currentDelayMs, and increases the
         * delay for any subsequent attempts. If there was a pending backoff operation
         * already, it will be canceled.
         */    Xi(t) {
            // Cancel any pending backoff operation.
            this.cancel();
            // First schedule using the current base (which may be 0 and should be
            // honored as such).
            const e = Math.floor(this.zi + this.Zi()), n = Math.max(0, Date.now() - this.Ji), s = Math.max(0, e - n);
            // Guard against lastAttemptTime being in the future due to a clock change.
                    s > 0 && k$1("ExponentialBackoff", `Backing off for ${s} ms (base delay: ${this.zi} ms, delay with jitter: ${e} ms, last attempt: ${n} ms ago)`), 
            this.Hi = this.Oe.enqueueAfterDelay(this.timerId, s, (() => (this.Ji = Date.now(), 
            t()))), 
            // Apply backoff factor to determine next delay and ensure it is within
            // bounds.
            this.zi *= this.Wi, this.zi < this.Qi && (this.zi = this.Qi), this.zi > this.Gi && (this.zi = this.Gi);
        }
        tr() {
            null !== this.Hi && (this.Hi.skipDelay(), this.Hi = null);
        }
        cancel() {
            null !== this.Hi && (this.Hi.cancel(), this.Hi = null);
        }
        /** Returns a random value in the range [-currentBaseMs/2, currentBaseMs/2] */    Zi() {
            return (Math.random() - .5) * this.zi;
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A PersistentStream is an abstract base class that represents a streaming RPC
     * to the Firestore backend. It's built on top of the connections own support
     * for streaming RPCs, and adds several critical features for our clients:
     *
     *   - Exponential backoff on failure
     *   - Authentication via CredentialsProvider
     *   - Dispatching all callbacks into the shared worker queue
     *   - Closing idle streams after 60 seconds of inactivity
     *
     * Subclasses of PersistentStream implement serialization of models to and
     * from the JSON representation of the protocol buffers for a specific
     * streaming RPC.
     *
     * ## Starting and Stopping
     *
     * Streaming RPCs are stateful and need to be start()ed before messages can
     * be sent and received. The PersistentStream will call the onOpen() function
     * of the listener once the stream is ready to accept requests.
     *
     * Should a start() fail, PersistentStream will call the registered onClose()
     * listener with a FirestoreError indicating what went wrong.
     *
     * A PersistentStream can be started and stopped repeatedly.
     *
     * Generic types:
     *  SendType: The type of the outgoing message of the underlying
     *    connection stream
     *  ReceiveType: The type of the incoming message of the underlying
     *    connection stream
     *  ListenerType: The type of the listener that will be used for callbacks
     */
    class Xr {
        constructor(t, e, n, s, i, r) {
            this.Oe = t, this.er = n, this.nr = s, this.credentialsProvider = i, this.listener = r, 
            this.state = 0 /* Initial */ , 
            /**
             * A close count that's incremented every time the stream is closed; used by
             * getCloseGuardedDispatcher() to invalidate callbacks that happen after
             * close.
             */
            this.sr = 0, this.ir = null, this.stream = null, this.rr = new Yr(t, e);
        }
        /**
         * Returns true if start() has been called and no error has occurred. True
         * indicates the stream is open or in the process of opening (which
         * encompasses respecting backoff, getting auth tokens, and starting the
         * actual RPC). Use isOpen() to determine if the stream is open and ready for
         * outbound requests.
         */    ar() {
            return 1 /* Starting */ === this.state || 2 /* Open */ === this.state || 4 /* Backoff */ === this.state;
        }
        /**
         * Returns true if the underlying RPC is open (the onOpen() listener has been
         * called) and the stream is ready for outbound requests.
         */    cr() {
            return 2 /* Open */ === this.state;
        }
        /**
         * Starts the RPC. Only allowed if isStarted() returns false. The stream is
         * not immediately ready for use: onOpen() will be invoked when the RPC is
         * ready for outbound requests, at which point isOpen() will return true.
         *
         * When start returns, isStarted() will return true.
         */    start() {
            3 /* Error */ !== this.state ? this.auth() : this.ur();
        }
        /**
         * Stops the RPC. This call is idempotent and allowed regardless of the
         * current isStarted() state.
         *
         * When stop returns, isStarted() and isOpen() will both return false.
         */    async stop() {
            this.ar() && await this.close(0 /* Initial */);
        }
        /**
         * After an error the stream will usually back off on the next attempt to
         * start it. If the error warrants an immediate restart of the stream, the
         * sender can use this to indicate that the receiver should not back off.
         *
         * Each error will call the onClose() listener. That function can decide to
         * inhibit backoff if required.
         */    hr() {
            this.state = 0 /* Initial */ , this.rr.reset();
        }
        /**
         * Marks this stream as idle. If no further actions are performed on the
         * stream for one minute, the stream will automatically close itself and
         * notify the stream's onClose() handler with Status.OK. The stream will then
         * be in a !isStarted() state, requiring the caller to start the stream again
         * before further use.
         *
         * Only streams that are in state 'Open' can be marked idle, as all other
         * states imply pending network operations.
         */    lr() {
            // Starts the idle time if we are in state 'Open' and are not yet already
            // running a timer (in which case the previous idle timeout still applies).
            this.cr() && null === this.ir && (this.ir = this.Oe.enqueueAfterDelay(this.er, 6e4, (() => this.dr())));
        }
        /** Sends a message to the underlying stream. */    wr(t) {
            this._r(), this.stream.send(t);
        }
        /** Called by the idle timer when the stream should close due to inactivity. */    async dr() {
            if (this.cr()) 
            // When timing out an idle stream there's no reason to force the stream into backoff when
            // it restarts so set the stream state to Initial instead of Error.
            return this.close(0 /* Initial */);
        }
        /** Marks the stream as active again. */    _r() {
            this.ir && (this.ir.cancel(), this.ir = null);
        }
        /**
         * Closes the stream and cleans up as necessary:
         *
         * * closes the underlying GRPC stream;
         * * calls the onClose handler with the given 'error';
         * * sets internal stream state to 'finalState';
         * * adjusts the backoff timer based on the error
         *
         * A new stream can be opened by calling start().
         *
         * @param finalState - the intended state of the stream after closing.
         * @param error - the error the connection was closed with.
         */    async close(t, e) {
            // Cancel any outstanding timers (they're guaranteed not to execute).
            this._r(), this.rr.cancel(), 
            // Invalidates any stream-related callbacks (e.g. from auth or the
            // underlying stream), guaranteeing they won't execute.
            this.sr++, 3 /* Error */ !== t ? 
            // If this is an intentional close ensure we don't delay our next connection attempt.
            this.rr.reset() : e && e.code === q$1.RESOURCE_EXHAUSTED ? (
            // Log the error. (Probably either 'quota exceeded' or 'max queue length reached'.)
            $(e.toString()), $("Using maximum backoff delay to prevent overloading the backend."), 
            this.rr.Yi()) : e && e.code === q$1.UNAUTHENTICATED && 
            // "unauthenticated" error means the token was rejected. Try force refreshing it in case it
            // just expired.
            this.credentialsProvider.invalidateToken(), 
            // Clean up the underlying stream because we are no longer interested in events.
            null !== this.stream && (this.mr(), this.stream.close(), this.stream = null), 
            // This state must be assigned before calling onClose() to allow the callback to
            // inhibit backoff or otherwise manipulate the state in its non-started state.
            this.state = t, 
            // Notify the listener that the stream closed.
            await this.listener.Ci(e);
        }
        /**
         * Can be overridden to perform additional cleanup before the stream is closed.
         * Calling super.tearDown() is not required.
         */    mr() {}
        auth() {
            this.state = 1 /* Starting */;
            const t = this.gr(this.sr), e = this.sr;
            // TODO(mikelehen): Just use dispatchIfNotClosed, but see TODO below.
                    this.credentialsProvider.getToken().then((t => {
                // Stream can be stopped while waiting for authentication.
                // TODO(mikelehen): We really should just use dispatchIfNotClosed
                // and let this dispatch onto the queue, but that opened a spec test can
                // of worms that I don't want to deal with in this PR.
                this.sr === e && 
                // Normally we'd have to schedule the callback on the AsyncQueue.
                // However, the following calls are safe to be called outside the
                // AsyncQueue since they don't chain asynchronous calls
                this.yr(t);
            }), (e => {
                t((() => {
                    const t = new K$1(q$1.UNKNOWN, "Fetching auth token failed: " + e.message);
                    return this.pr(t);
                }));
            }));
        }
        yr(t) {
            const e = this.gr(this.sr);
            this.stream = this.Er(t), this.stream.Si((() => {
                e((() => (this.state = 2 /* Open */ , this.listener.Si())));
            })), this.stream.Ci((t => {
                e((() => this.pr(t)));
            })), this.stream.onMessage((t => {
                e((() => this.onMessage(t)));
            }));
        }
        ur() {
            this.state = 4 /* Backoff */ , this.rr.Xi((async () => {
                this.state = 0 /* Initial */ , this.start();
            }));
        }
        // Visible for tests
        pr(t) {
            // In theory the stream could close cleanly, however, in our current model
            // we never expect this to happen because if we stop a stream ourselves,
            // this callback will never be called. To prevent cases where we retry
            // without a backoff accidentally, we set the stream to error in all cases.
            return k$1("PersistentStream", `close with error: ${t}`), this.stream = null, this.close(3 /* Error */ , t);
        }
        /**
         * Returns a "dispatcher" function that dispatches operations onto the
         * AsyncQueue but only runs them if closeCount remains unchanged. This allows
         * us to turn auth / stream callbacks into no-ops if the stream is closed /
         * re-opened, etc.
         */    gr(t) {
            return e => {
                this.Oe.enqueueAndForget((() => this.sr === t ? e() : (k$1("PersistentStream", "stream callback skipped by getCloseGuardedDispatcher."), 
                Promise.resolve())));
            };
        }
    }

    /**
     * A PersistentStream that implements the Listen RPC.
     *
     * Once the Listen stream has called the onOpen() listener, any number of
     * listen() and unlisten() calls can be made to control what changes will be
     * sent from the server for ListenResponses.
     */ class Zr extends Xr {
        constructor(t, e, n, s, i) {
            super(t, "listen_stream_connection_backoff" /* ListenStreamConnectionBackoff */ , "listen_stream_idle" /* ListenStreamIdle */ , e, n, i), 
            this.N = s;
        }
        Er(t) {
            return this.nr.ji("Listen", t);
        }
        onMessage(t) {
            // A successful response means the stream is healthy
            this.rr.reset();
            const e = es(this.N, t), n = function(t) {
                // We have only reached a consistent snapshot for the entire stream if there
                // is a read_time set and it applies to all targets (i.e. the list of
                // targets is empty). The backend is guaranteed to send such responses.
                if (!("targetChange" in t)) return it.min();
                const e = t.targetChange;
                return e.targetIds && e.targetIds.length ? it.min() : e.readTime ? Kn(e.readTime) : it.min();
            }(t);
            return this.listener.Tr(e, n);
        }
        /**
         * Registers interest in the results of the given target. If the target
         * includes a resumeToken it will be included in the request. Results that
         * affect the target will be streamed back as WatchChange messages that
         * reference the targetId.
         */    Ir(t) {
            const e = {};
            e.database = Jn(this.N), e.addTarget = function(t, e) {
                let n;
                const s = e.target;
                return n = zt(s) ? {
                    documents: rs(t, s)
                } : {
                    query: os(t, s)
                }, n.targetId = e.targetId, e.resumeToken.approximateByteSize() > 0 ? n.resumeToken = Un(t, e.resumeToken) : e.snapshotVersion.compareTo(it.min()) > 0 && (
                // TODO(wuandy): Consider removing above check because it is most likely true.
                // Right now, many tests depend on this behaviour though (leaving min() out
                // of serialization).
                n.readTime = Bn(t, e.snapshotVersion.toTimestamp())), n;
            }(this.N, t);
            const n = cs(this.N, t);
            n && (e.labels = n), this.wr(e);
        }
        /**
         * Unregisters interest in the results of the target associated with the
         * given targetId.
         */    Ar(t) {
            const e = {};
            e.database = Jn(this.N), e.removeTarget = t, this.wr(e);
        }
    }

    /**
     * A Stream that implements the Write RPC.
     *
     * The Write RPC requires the caller to maintain special streamToken
     * state in between calls, to help the server understand which responses the
     * client has processed by the time the next request is made. Every response
     * will contain a streamToken; this value must be passed to the next
     * request.
     *
     * After calling start() on this stream, the next request must be a handshake,
     * containing whatever streamToken is on hand. Once a response to this
     * request is received, all pending mutations may be submitted. When
     * submitting multiple batches of mutations at the same time, it's
     * okay to use the same streamToken for the calls to writeMutations.
     *
     * TODO(b/33271235): Use proto types
     */ class to extends Xr {
        constructor(t, e, n, s, i) {
            super(t, "write_stream_connection_backoff" /* WriteStreamConnectionBackoff */ , "write_stream_idle" /* WriteStreamIdle */ , e, n, i), 
            this.N = s, this.Rr = !1;
        }
        /**
         * Tracks whether or not a handshake has been successfully exchanged and
         * the stream is ready to accept mutations.
         */    get Pr() {
            return this.Rr;
        }
        // Override of PersistentStream.start
        start() {
            this.Rr = !1, this.lastStreamToken = void 0, super.start();
        }
        mr() {
            this.Rr && this.br([]);
        }
        Er(t) {
            return this.nr.ji("Write", t);
        }
        onMessage(t) {
            if (
            // Always capture the last stream token.
            L$1(!!t.streamToken), this.lastStreamToken = t.streamToken, this.Rr) {
                // A successful first write response means the stream is healthy,
                // Note, that we could consider a successful handshake healthy, however,
                // the write itself might be causing an error we want to back off from.
                this.rr.reset();
                const e = is(t.writeResults, t.commitTime), n = Kn(t.commitTime);
                return this.listener.vr(n, e);
            }
            // The first response is always the handshake response
            return L$1(!t.writeResults || 0 === t.writeResults.length), this.Rr = !0, this.listener.Vr();
        }
        /**
         * Sends an initial streamToken to the server, performing the handshake
         * required to make the StreamingWrite RPC work. Subsequent
         * calls should wait until onHandshakeComplete was called.
         */    Sr() {
            // TODO(dimond): Support stream resumption. We intentionally do not set the
            // stream token on the handshake, ignoring any stream token we might have.
            const t = {};
            t.database = Jn(this.N), this.wr(t);
        }
        /** Sends a group of mutations to the Firestore backend to apply. */    br(t) {
            const e = {
                streamToken: this.lastStreamToken,
                writes: t.map((t => ns(this.N, t)))
            };
            this.wr(e);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Datastore and its related methods are a wrapper around the external Google
     * Cloud Datastore grpc API, which provides an interface that is more convenient
     * for the rest of the client SDK architecture to consume.
     */
    /**
     * An implementation of Datastore that exposes additional state for internal
     * consumption.
     */
    class eo extends class {} {
        constructor(t, e, n) {
            super(), this.credentials = t, this.nr = e, this.N = n, this.Dr = !1;
        }
        Cr() {
            if (this.Dr) throw new K$1(q$1.FAILED_PRECONDITION, "The client has already been terminated.");
        }
        /** Gets an auth token and invokes the provided RPC. */    Li(t, e, n) {
            return this.Cr(), this.credentials.getToken().then((s => this.nr.Li(t, e, n, s))).catch((t => {
                throw "FirebaseError" === t.name ? (t.code === q$1.UNAUTHENTICATED && this.credentials.invalidateToken(), 
                t) : new K$1(q$1.UNKNOWN, t.toString());
            }));
        }
        /** Gets an auth token and invokes the provided RPC with streamed results. */    Ki(t, e, n) {
            return this.Cr(), this.credentials.getToken().then((s => this.nr.Ki(t, e, n, s))).catch((t => {
                throw "FirebaseError" === t.name ? (t.code === q$1.UNAUTHENTICATED && this.credentials.invalidateToken(), 
                t) : new K$1(q$1.UNKNOWN, t.toString());
            }));
        }
        terminate() {
            this.Dr = !0;
        }
    }

    // TODO(firestorexp): Make sure there is only one Datastore instance per
    // firestore-exp client.
    /**
     * A component used by the RemoteStore to track the OnlineState (that is,
     * whether or not the client as a whole should be considered to be online or
     * offline), implementing the appropriate heuristics.
     *
     * In particular, when the client is trying to connect to the backend, we
     * allow up to MAX_WATCH_STREAM_FAILURES within ONLINE_STATE_TIMEOUT_MS for
     * a connection to succeed. If we have too many failures or the timeout elapses,
     * then we set the OnlineState to Offline, and the client will behave as if
     * it is offline (get()s will return cached data, etc.).
     */
    class no {
        constructor(t, e) {
            this.asyncQueue = t, this.onlineStateHandler = e, 
            /** The current OnlineState. */
            this.state = "Unknown" /* Unknown */ , 
            /**
             * A count of consecutive failures to open the stream. If it reaches the
             * maximum defined by MAX_WATCH_STREAM_FAILURES, we'll set the OnlineState to
             * Offline.
             */
            this.Nr = 0, 
            /**
             * A timer that elapses after ONLINE_STATE_TIMEOUT_MS, at which point we
             * transition from OnlineState.Unknown to OnlineState.Offline without waiting
             * for the stream to actually fail (MAX_WATCH_STREAM_FAILURES times).
             */
            this.kr = null, 
            /**
             * Whether the client should log a warning message if it fails to connect to
             * the backend (initially true, cleared after a successful stream, or if we've
             * logged the message already).
             */
            this.$r = !0;
        }
        /**
         * Called by RemoteStore when a watch stream is started (including on each
         * backoff attempt).
         *
         * If this is the first attempt, it sets the OnlineState to Unknown and starts
         * the onlineStateTimer.
         */    Or() {
            0 === this.Nr && (this.Fr("Unknown" /* Unknown */), this.kr = this.asyncQueue.enqueueAfterDelay("online_state_timeout" /* OnlineStateTimeout */ , 1e4, (() => (this.kr = null, 
            this.Mr("Backend didn't respond within 10 seconds."), this.Fr("Offline" /* Offline */), 
            Promise.resolve()))));
        }
        /**
         * Updates our OnlineState as appropriate after the watch stream reports a
         * failure. The first failure moves us to the 'Unknown' state. We then may
         * allow multiple failures (based on MAX_WATCH_STREAM_FAILURES) before we
         * actually transition to the 'Offline' state.
         */    Lr(t) {
            "Online" /* Online */ === this.state ? this.Fr("Unknown" /* Unknown */) : (this.Nr++, 
            this.Nr >= 1 && (this.Br(), this.Mr(`Connection failed 1 times. Most recent error: ${t.toString()}`), 
            this.Fr("Offline" /* Offline */)));
        }
        /**
         * Explicitly sets the OnlineState to the specified state.
         *
         * Note that this resets our timers / failure counters, etc. used by our
         * Offline heuristics, so must not be used in place of
         * handleWatchStreamStart() and handleWatchStreamFailure().
         */    set(t) {
            this.Br(), this.Nr = 0, "Online" /* Online */ === t && (
            // We've connected to watch at least once. Don't warn the developer
            // about being offline going forward.
            this.$r = !1), this.Fr(t);
        }
        Fr(t) {
            t !== this.state && (this.state = t, this.onlineStateHandler(t));
        }
        Mr(t) {
            const e = `Could not reach Cloud Firestore backend. ${t}\nThis typically indicates that your device does not have a healthy Internet connection at the moment. The client will operate in offline mode until it is able to successfully connect to the backend.`;
            this.$r ? ($(e), this.$r = !1) : k$1("OnlineStateTracker", e);
        }
        Br() {
            null !== this.kr && (this.kr.cancel(), this.kr = null);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class so {
        constructor(
        /**
         * The local store, used to fill the write pipeline with outbound mutations.
         */
        t, 
        /** The client-side proxy for interacting with the backend. */
        e, n, s, i) {
            this.localStore = t, this.datastore = e, this.asyncQueue = n, this.remoteSyncer = {}, 
            /**
             * A list of up to MAX_PENDING_WRITES writes that we have fetched from the
             * LocalStore via fillWritePipeline() and have or will send to the write
             * stream.
             *
             * Whenever writePipeline.length > 0 the RemoteStore will attempt to start or
             * restart the write stream. When the stream is established the writes in the
             * pipeline will be sent in order.
             *
             * Writes remain in writePipeline until they are acknowledged by the backend
             * and thus will automatically be re-sent if the stream is interrupted /
             * restarted before they're acknowledged.
             *
             * Write responses from the backend are linked to their originating request
             * purely based on order, and so we can just shift() writes from the front of
             * the writePipeline as we receive responses.
             */
            this.Ur = [], 
            /**
             * A mapping of watched targets that the client cares about tracking and the
             * user has explicitly called a 'listen' for this target.
             *
             * These targets may or may not have been sent to or acknowledged by the
             * server. On re-establishing the listen stream, these targets should be sent
             * to the server. The targets removed with unlistens are removed eagerly
             * without waiting for confirmation from the listen stream.
             */
            this.qr = new Map, 
            /**
             * A set of reasons for why the RemoteStore may be offline. If empty, the
             * RemoteStore may start its network connections.
             */
            this.Kr = new Set, 
            /**
             * Event handlers that get called when the network is disabled or enabled.
             *
             * PORTING NOTE: These functions are used on the Web client to create the
             * underlying streams (to support tree-shakeable streams). On Android and iOS,
             * the streams are created during construction of RemoteStore.
             */
            this.jr = [], this.Qr = i, this.Qr.Ei((t => {
                n.enqueueAndForget((async () => {
                    // Porting Note: Unlike iOS, `restartNetwork()` is called even when the
                    // network becomes unreachable as we don't have any other way to tear
                    // down our streams.
                    fo(this) && (k$1("RemoteStore", "Restarting streams for network reachability change."), 
                    await async function(t) {
                        const e = U$1(t);
                        e.Kr.add(4 /* ConnectivityChange */), await ro(e), e.Wr.set("Unknown" /* Unknown */), 
                        e.Kr.delete(4 /* ConnectivityChange */), await io(e);
                    }(this));
                }));
            })), this.Wr = new no(n, s);
        }
    }

    async function io(t) {
        if (fo(t)) for (const e of t.jr) await e(/* enabled= */ !0);
    }

    /**
     * Temporarily disables the network. The network can be re-enabled using
     * enableNetwork().
     */ async function ro(t) {
        for (const e of t.jr) await e(/* enabled= */ !1);
    }

    /**
     * Starts new listen for the given target. Uses resume token if provided. It
     * is a no-op if the target of given `TargetData` is already being listened to.
     */
    function oo(t, e) {
        const n = U$1(t);
        n.qr.has(e.targetId) || (
        // Mark this as something the client is currently listening for.
        n.qr.set(e.targetId, e), lo(n) ? 
        // The listen will be sent in onWatchStreamOpen
        ho(n) : Do(n).cr() && co(n, e));
    }

    /**
     * Removes the listen from server. It is a no-op if the given target id is
     * not being listened to.
     */ function ao(t, e) {
        const n = U$1(t), s = Do(n);
        n.qr.delete(e), s.cr() && uo(n, e), 0 === n.qr.size && (s.cr() ? s.lr() : fo(n) && 
        // Revert to OnlineState.Unknown if the watch stream is not open and we
        // have no listeners, since without any listens to send we cannot
        // confirm if the stream is healthy and upgrade to OnlineState.Online.
        n.Wr.set("Unknown" /* Unknown */));
    }

    /**
     * We need to increment the the expected number of pending responses we're due
     * from watch so we wait for the ack to process any messages from this target.
     */ function co(t, e) {
        t.Gr.Y(e.targetId), Do(t).Ir(e);
    }

    /**
     * We need to increment the expected number of pending responses we're due
     * from watch so we wait for the removal on the server before we process any
     * messages from this target.
     */ function uo(t, e) {
        t.Gr.Y(e), Do(t).Ar(e);
    }

    function ho(t) {
        t.Gr = new kn({
            getRemoteKeysForTarget: e => t.remoteSyncer.getRemoteKeysForTarget(e),
            Et: e => t.qr.get(e) || null
        }), Do(t).start(), t.Wr.Or();
    }

    /**
     * Returns whether the watch stream should be started because it's necessary
     * and has not yet been started.
     */ function lo(t) {
        return fo(t) && !Do(t).ar() && t.qr.size > 0;
    }

    function fo(t) {
        return 0 === U$1(t).Kr.size;
    }

    function wo(t) {
        t.Gr = void 0;
    }

    async function _o(t) {
        t.qr.forEach(((e, n) => {
            co(t, e);
        }));
    }

    async function mo(t, e) {
        wo(t), 
        // If we still need the watch stream, retry the connection.
        lo(t) ? (t.Wr.Lr(e), ho(t)) : 
        // No need to restart watch stream because there are no active targets.
        // The online state is set to unknown because there is no active attempt
        // at establishing a connection
        t.Wr.set("Unknown" /* Unknown */);
    }

    async function go(t, e, n) {
        if (
        // Mark the client as online since we got a message from the server
        t.Wr.set("Online" /* Online */), e instanceof Nn && 2 /* Removed */ === e.state && e.cause) 
        // There was an error on a target, don't wait for a consistent snapshot
        // to raise events
        try {
            await 
            /** Handles an error on a target */
            async function(t, e) {
                const n = e.cause;
                for (const s of e.targetIds) 
                // A watched target might have been removed already.
                t.qr.has(s) && (await t.remoteSyncer.rejectListen(s, n), t.qr.delete(s), t.Gr.removeTarget(s));
            }
            /**
     * Attempts to fill our write pipeline with writes from the LocalStore.
     *
     * Called internally to bootstrap or refill the write pipeline and by
     * SyncEngine whenever there are new mutations to process.
     *
     * Starts the write stream if necessary.
     */ (t, e);
        } catch (n) {
            k$1("RemoteStore", "Failed to remove targets %s: %s ", e.targetIds.join(","), n), 
            await yo(t, n);
        } else if (e instanceof Dn ? t.Gr.rt(e) : e instanceof Cn ? t.Gr.ft(e) : t.Gr.ct(e), 
        !n.isEqual(it.min())) try {
            const e = await lr(t.localStore);
            n.compareTo(e) >= 0 && 
            // We have received a target change with a global snapshot if the snapshot
            // version is not equal to SnapshotVersion.min().
            await 
            /**
     * Takes a batch of changes from the Datastore, repackages them as a
     * RemoteEvent, and passes that on to the listener, which is typically the
     * SyncEngine.
     */
            function(t, e) {
                const n = t.Gr._t(e);
                // Update in-memory resume tokens. LocalStore will update the
                // persistent view of these when applying the completed RemoteEvent.
                            return n.targetChanges.forEach(((n, s) => {
                    if (n.resumeToken.approximateByteSize() > 0) {
                        const i = t.qr.get(s);
                        // A watched target might have been removed already.
                                            i && t.qr.set(s, i.withResumeToken(n.resumeToken, e));
                    }
                })), 
                // Re-establish listens for the targets that have been invalidated by
                // existence filter mismatches.
                n.targetMismatches.forEach((e => {
                    const n = t.qr.get(e);
                    if (!n) 
                    // A watched target might have been removed already.
                    return;
                    // Clear the resume token for the target, since we're in a known mismatch
                    // state.
                                    t.qr.set(e, n.withResumeToken(wt.EMPTY_BYTE_STRING, n.snapshotVersion)), 
                    // Cause a hard reset by unwatching and rewatching immediately, but
                    // deliberately don't send a resume token so that we get a full update.
                    uo(t, e);
                    // Mark the target we send as being on behalf of an existence filter
                    // mismatch, but don't actually retain that in listenTargets. This ensures
                    // that we flag the first re-listen this way without impacting future
                    // listens of this target (that might happen e.g. on reconnect).
                    const s = new si(n.target, e, 1 /* ExistenceFilterMismatch */ , n.sequenceNumber);
                    co(t, s);
                })), t.remoteSyncer.applyRemoteEvent(n);
            }(t, n);
        } catch (e) {
            k$1("RemoteStore", "Failed to raise snapshot:", e), await yo(t, e);
        }
    }

    /**
     * Recovery logic for IndexedDB errors that takes the network offline until
     * `op` succeeds. Retries are scheduled with backoff using
     * `enqueueRetryable()`. If `op()` is not provided, IndexedDB access is
     * validated via a generic operation.
     *
     * The returned Promise is resolved once the network is disabled and before
     * any retry attempt.
     */ async function yo(t, e, n) {
        if (!zs(e)) throw e;
        t.Kr.add(1 /* IndexedDbFailed */), 
        // Disable network and raise offline snapshots
        await ro(t), t.Wr.set("Offline" /* Offline */), n || (
        // Use a simple read operation to determine if IndexedDB recovered.
        // Ideally, we would expose a health check directly on SimpleDb, but
        // RemoteStore only has access to persistence through LocalStore.
        n = () => lr(t.localStore)), 
        // Probe IndexedDB periodically and re-enable network
        t.asyncQueue.enqueueRetryable((async () => {
            k$1("RemoteStore", "Retrying IndexedDB access"), await n(), t.Kr.delete(1 /* IndexedDbFailed */), 
            await io(t);
        }));
    }

    /**
     * Executes `op`. If `op` fails, takes the network offline until `op`
     * succeeds. Returns after the first attempt.
     */ function po(t, e) {
        return e().catch((n => yo(t, n, e)));
    }

    async function Eo(t) {
        const e = U$1(t), n = Co(e);
        let s = e.Ur.length > 0 ? e.Ur[e.Ur.length - 1].batchId : -1;
        for (;To(e); ) try {
            const t = await wr(e.localStore, s);
            if (null === t) {
                0 === e.Ur.length && n.lr();
                break;
            }
            s = t.batchId, Io(e, t);
        } catch (t) {
            await yo(e, t);
        }
        Ao(e) && Ro(e);
    }

    /**
     * Returns true if we can add to the write pipeline (i.e. the network is
     * enabled and the write pipeline is not full).
     */ function To(t) {
        return fo(t) && t.Ur.length < 10;
    }

    /**
     * Queues additional writes to be sent to the write stream, sending them
     * immediately if the write stream is established.
     */ function Io(t, e) {
        t.Ur.push(e);
        const n = Co(t);
        n.cr() && n.Pr && n.br(e.mutations);
    }

    function Ao(t) {
        return fo(t) && !Co(t).ar() && t.Ur.length > 0;
    }

    function Ro(t) {
        Co(t).start();
    }

    async function Po(t) {
        Co(t).Sr();
    }

    async function bo(t) {
        const e = Co(t);
        // Send the write pipeline now that the stream is established.
            for (const n of t.Ur) e.br(n.mutations);
    }

    async function vo(t, e, n) {
        const s = t.Ur.shift(), i = ni.from(s, e, n);
        await po(t, (() => t.remoteSyncer.applySuccessfulWrite(i))), 
        // It's possible that with the completion of this mutation another
        // slot has freed up.
        await Eo(t);
    }

    async function Vo(t, e) {
        // If the write stream closed after the write handshake completes, a write
        // operation failed and we fail the pending operation.
        e && Co(t).Pr && 
        // This error affects the actual write.
        await async function(t, e) {
            // Only handle permanent errors here. If it's transient, just let the retry
            // logic kick in.
            if (n = e.code, ln(n) && n !== q$1.ABORTED) {
                // This was a permanent error, the request itself was the problem
                // so it's not going to succeed if we resend it.
                const n = t.Ur.shift();
                // In this case it's also unlikely that the server itself is melting
                // down -- this was just a bad request so inhibit backoff on the next
                // restart.
                            Co(t).hr(), await po(t, (() => t.remoteSyncer.rejectFailedWrite(n.batchId, e))), 
                // It's possible that with the completion of this mutation
                // another slot has freed up.
                await Eo(t);
            }
            var n;
        }(t, e), 
        // The write stream might have been started by refilling the write
        // pipeline for failed writes
        Ao(t) && Ro(t);
    }

    /**
     * Toggles the network state when the client gains or loses its primary lease.
     */
    async function So(t, e) {
        const n = U$1(t);
        e ? (n.Kr.delete(2 /* IsSecondary */), await io(n)) : e || (n.Kr.add(2 /* IsSecondary */), 
        await ro(n), n.Wr.set("Unknown" /* Unknown */));
    }

    /**
     * If not yet initialized, registers the WatchStream and its network state
     * callback with `remoteStoreImpl`. Returns the existing stream if one is
     * already available.
     *
     * PORTING NOTE: On iOS and Android, the WatchStream gets registered on startup.
     * This is not done on Web to allow it to be tree-shaken.
     */ function Do(t) {
        return t.zr || (
        // Create stream (but note that it is not started yet).
        t.zr = function(t, e, n) {
            const s = U$1(t);
            return s.Cr(), new Zr(e, s.nr, s.credentials, s.N, n);
        }
        /**
     * @license
     * Copyright 2018 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ (t.datastore, t.asyncQueue, {
            Si: _o.bind(null, t),
            Ci: mo.bind(null, t),
            Tr: go.bind(null, t)
        }), t.jr.push((async e => {
            e ? (t.zr.hr(), lo(t) ? ho(t) : t.Wr.set("Unknown" /* Unknown */)) : (await t.zr.stop(), 
            wo(t));
        }))), t.zr;
    }

    /**
     * If not yet initialized, registers the WriteStream and its network state
     * callback with `remoteStoreImpl`. Returns the existing stream if one is
     * already available.
     *
     * PORTING NOTE: On iOS and Android, the WriteStream gets registered on startup.
     * This is not done on Web to allow it to be tree-shaken.
     */ function Co(t) {
        return t.Hr || (
        // Create stream (but note that it is not started yet).
        t.Hr = function(t, e, n) {
            const s = U$1(t);
            return s.Cr(), new to(e, s.nr, s.credentials, s.N, n);
        }(t.datastore, t.asyncQueue, {
            Si: Po.bind(null, t),
            Ci: Vo.bind(null, t),
            Vr: bo.bind(null, t),
            vr: vo.bind(null, t)
        }), t.jr.push((async e => {
            e ? (t.Hr.hr(), 
            // This will start the write stream if necessary.
            await Eo(t)) : (await t.Hr.stop(), t.Ur.length > 0 && (k$1("RemoteStore", `Stopping write stream with ${t.Ur.length} pending writes`), 
            t.Ur = []));
        }))), t.Hr;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Represents an operation scheduled to be run in the future on an AsyncQueue.
     *
     * It is created via DelayedOperation.createAndSchedule().
     *
     * Supports cancellation (via cancel()) and early execution (via skipDelay()).
     *
     * Note: We implement `PromiseLike` instead of `Promise`, as the `Promise` type
     * in newer versions of TypeScript defines `finally`, which is not available in
     * IE.
     */
    class No {
        constructor(t, e, n, s, i) {
            this.asyncQueue = t, this.timerId = e, this.targetTimeMs = n, this.op = s, this.removalCallback = i, 
            this.deferred = new j, this.then = this.deferred.promise.then.bind(this.deferred.promise), 
            // It's normal for the deferred promise to be canceled (due to cancellation)
            // and so we attach a dummy catch callback to avoid
            // 'UnhandledPromiseRejectionWarning' log spam.
            this.deferred.promise.catch((t => {}));
        }
        /**
         * Creates and returns a DelayedOperation that has been scheduled to be
         * executed on the provided asyncQueue after the provided delayMs.
         *
         * @param asyncQueue - The queue to schedule the operation on.
         * @param id - A Timer ID identifying the type of operation this is.
         * @param delayMs - The delay (ms) before the operation should be scheduled.
         * @param op - The operation to run.
         * @param removalCallback - A callback to be called synchronously once the
         *   operation is executed or canceled, notifying the AsyncQueue to remove it
         *   from its delayedOperations list.
         *   PORTING NOTE: This exists to prevent making removeDelayedOperation() and
         *   the DelayedOperation class public.
         */    static createAndSchedule(t, e, n, s, i) {
            const r = Date.now() + n, o = new No(t, e, r, s, i);
            return o.start(n), o;
        }
        /**
         * Starts the timer. This is called immediately after construction by
         * createAndSchedule().
         */    start(t) {
            this.timerHandle = setTimeout((() => this.handleDelayElapsed()), t);
        }
        /**
         * Queues the operation to run immediately (if it hasn't already been run or
         * canceled).
         */    skipDelay() {
            return this.handleDelayElapsed();
        }
        /**
         * Cancels the operation if it hasn't already been executed or canceled. The
         * promise will be rejected.
         *
         * As long as the operation has not yet been run, calling cancel() provides a
         * guarantee that the operation will not be run.
         */    cancel(t) {
            null !== this.timerHandle && (this.clearTimeout(), this.deferred.reject(new K$1(q$1.CANCELLED, "Operation cancelled" + (t ? ": " + t : ""))));
        }
        handleDelayElapsed() {
            this.asyncQueue.enqueueAndForget((() => null !== this.timerHandle ? (this.clearTimeout(), 
            this.op().then((t => this.deferred.resolve(t)))) : Promise.resolve()));
        }
        clearTimeout() {
            null !== this.timerHandle && (this.removalCallback(this), clearTimeout(this.timerHandle), 
            this.timerHandle = null);
        }
    }

    /**
     * Returns a FirestoreError that can be surfaced to the user if the provided
     * error is an IndexedDbTransactionError. Re-throws the error otherwise.
     */ function xo(t, e) {
        if ($("AsyncQueue", `${e}: ${t}`), zs(t)) return new K$1(q$1.UNAVAILABLE, `${e}: ${t}`);
        throw t;
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * DocumentSet is an immutable (copy-on-write) collection that holds documents
     * in order specified by the provided comparator. We always add a document key
     * comparator on top of what is provided to guarantee document equality based on
     * the key.
     */ class ko {
        /** The default ordering is by key if the comparator is omitted */
        constructor(t) {
            // We are adding document key comparator to the end as it's the only
            // guaranteed unique property of a document.
            this.comparator = t ? (e, n) => t(e, n) || Pt.comparator(e.key, n.key) : (t, e) => Pt.comparator(t.key, e.key), 
            this.keyedMap = Tn(), this.sortedSet = new dn(this.comparator);
        }
        /**
         * Returns an empty copy of the existing DocumentSet, using the same
         * comparator.
         */    static emptySet(t) {
            return new ko(t.comparator);
        }
        has(t) {
            return null != this.keyedMap.get(t);
        }
        get(t) {
            return this.keyedMap.get(t);
        }
        first() {
            return this.sortedSet.minKey();
        }
        last() {
            return this.sortedSet.maxKey();
        }
        isEmpty() {
            return this.sortedSet.isEmpty();
        }
        /**
         * Returns the index of the provided key in the document set, or -1 if the
         * document key is not present in the set;
         */    indexOf(t) {
            const e = this.keyedMap.get(t);
            return e ? this.sortedSet.indexOf(e) : -1;
        }
        get size() {
            return this.sortedSet.size;
        }
        /** Iterates documents in order defined by "comparator" */    forEach(t) {
            this.sortedSet.inorderTraversal(((e, n) => (t(e), !1)));
        }
        /** Inserts or updates a document with the same key */    add(t) {
            // First remove the element if we have it.
            const e = this.delete(t.key);
            return e.copy(e.keyedMap.insert(t.key, t), e.sortedSet.insert(t, null));
        }
        /** Deletes a document with a given key */    delete(t) {
            const e = this.get(t);
            return e ? this.copy(this.keyedMap.remove(t), this.sortedSet.remove(e)) : this;
        }
        isEqual(t) {
            if (!(t instanceof ko)) return !1;
            if (this.size !== t.size) return !1;
            const e = this.sortedSet.getIterator(), n = t.sortedSet.getIterator();
            for (;e.hasNext(); ) {
                const t = e.getNext().key, s = n.getNext().key;
                if (!t.isEqual(s)) return !1;
            }
            return !0;
        }
        toString() {
            const t = [];
            return this.forEach((e => {
                t.push(e.toString());
            })), 0 === t.length ? "DocumentSet ()" : "DocumentSet (\n  " + t.join("  \n") + "\n)";
        }
        copy(t, e) {
            const n = new ko;
            return n.comparator = this.comparator, n.keyedMap = t, n.sortedSet = e, n;
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * DocumentChangeSet keeps track of a set of changes to docs in a query, merging
     * duplicate events for the same doc.
     */ class $o {
        constructor() {
            this.Jr = new dn(Pt.comparator);
        }
        track(t) {
            const e = t.doc.key, n = this.Jr.get(e);
            n ? 
            // Merge the new change with the existing change.
            0 /* Added */ !== t.type && 3 /* Metadata */ === n.type ? this.Jr = this.Jr.insert(e, t) : 3 /* Metadata */ === t.type && 1 /* Removed */ !== n.type ? this.Jr = this.Jr.insert(e, {
                type: n.type,
                doc: t.doc
            }) : 2 /* Modified */ === t.type && 2 /* Modified */ === n.type ? this.Jr = this.Jr.insert(e, {
                type: 2 /* Modified */ ,
                doc: t.doc
            }) : 2 /* Modified */ === t.type && 0 /* Added */ === n.type ? this.Jr = this.Jr.insert(e, {
                type: 0 /* Added */ ,
                doc: t.doc
            }) : 1 /* Removed */ === t.type && 0 /* Added */ === n.type ? this.Jr = this.Jr.remove(e) : 1 /* Removed */ === t.type && 2 /* Modified */ === n.type ? this.Jr = this.Jr.insert(e, {
                type: 1 /* Removed */ ,
                doc: n.doc
            }) : 0 /* Added */ === t.type && 1 /* Removed */ === n.type ? this.Jr = this.Jr.insert(e, {
                type: 2 /* Modified */ ,
                doc: t.doc
            }) : 
            // This includes these cases, which don't make sense:
            // Added->Added
            // Removed->Removed
            // Modified->Added
            // Removed->Modified
            // Metadata->Added
            // Removed->Metadata
            M$1() : this.Jr = this.Jr.insert(e, t);
        }
        Yr() {
            const t = [];
            return this.Jr.inorderTraversal(((e, n) => {
                t.push(n);
            })), t;
        }
    }

    class Oo {
        constructor(t, e, n, s, i, r, o, a) {
            this.query = t, this.docs = e, this.oldDocs = n, this.docChanges = s, this.mutatedKeys = i, 
            this.fromCache = r, this.syncStateChanged = o, this.excludesMetadataChanges = a;
        }
        /** Returns a view snapshot as if all documents in the snapshot were added. */    static fromInitialDocuments(t, e, n, s) {
            const i = [];
            return e.forEach((t => {
                i.push({
                    type: 0 /* Added */ ,
                    doc: t
                });
            })), new Oo(t, e, ko.emptySet(e), i, n, s, 
            /* syncStateChanged= */ !0, 
            /* excludesMetadataChanges= */ !1);
        }
        get hasPendingWrites() {
            return !this.mutatedKeys.isEmpty();
        }
        isEqual(t) {
            if (!(this.fromCache === t.fromCache && this.syncStateChanged === t.syncStateChanged && this.mutatedKeys.isEqual(t.mutatedKeys) && Ie(this.query, t.query) && this.docs.isEqual(t.docs) && this.oldDocs.isEqual(t.oldDocs))) return !1;
            const e = this.docChanges, n = t.docChanges;
            if (e.length !== n.length) return !1;
            for (let t = 0; t < e.length; t++) if (e[t].type !== n[t].type || !e[t].doc.isEqual(n[t].doc)) return !1;
            return !0;
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Holds the listeners and the last received ViewSnapshot for a query being
     * tracked by EventManager.
     */ class Fo {
        constructor() {
            this.Xr = void 0, this.listeners = [];
        }
    }

    class Mo {
        constructor() {
            this.queries = new Ki((t => Ae(t)), Ie), this.onlineState = "Unknown" /* Unknown */ , 
            this.Zr = new Set;
        }
    }

    async function Lo(t, e) {
        const n = U$1(t), s = e.query;
        let i = !1, r = n.queries.get(s);
        if (r || (i = !0, r = new Fo), i) try {
            r.Xr = await n.onListen(s);
        } catch (t) {
            const n = xo(t, `Initialization of query '${Re(e.query)}' failed`);
            return void e.onError(n);
        }
        if (n.queries.set(s, r), r.listeners.push(e), 
        // Run global snapshot listeners if a consistent snapshot has been emitted.
        e.eo(n.onlineState), r.Xr) {
            e.no(r.Xr) && Ko(n);
        }
    }

    async function Bo(t, e) {
        const n = U$1(t), s = e.query;
        let i = !1;
        const r = n.queries.get(s);
        if (r) {
            const t = r.listeners.indexOf(e);
            t >= 0 && (r.listeners.splice(t, 1), i = 0 === r.listeners.length);
        }
        if (i) return n.queries.delete(s), n.onUnlisten(s);
    }

    function Uo(t, e) {
        const n = U$1(t);
        let s = !1;
        for (const t of e) {
            const e = t.query, i = n.queries.get(e);
            if (i) {
                for (const e of i.listeners) e.no(t) && (s = !0);
                i.Xr = t;
            }
        }
        s && Ko(n);
    }

    function qo(t, e, n) {
        const s = U$1(t), i = s.queries.get(e);
        if (i) for (const t of i.listeners) t.onError(n);
        // Remove all listeners. NOTE: We don't need to call syncEngine.unlisten()
        // after an error.
            s.queries.delete(e);
    }

    // Call all global snapshot listeners that have been set.
    function Ko(t) {
        t.Zr.forEach((t => {
            t.next();
        }));
    }

    /**
     * QueryListener takes a series of internal view snapshots and determines
     * when to raise the event.
     *
     * It uses an Observer to dispatch events.
     */ class jo {
        constructor(t, e, n) {
            this.query = t, this.so = e, 
            /**
             * Initial snapshots (e.g. from cache) may not be propagated to the wrapped
             * observer. This flag is set to true once we've actually raised an event.
             */
            this.io = !1, this.ro = null, this.onlineState = "Unknown" /* Unknown */ , this.options = n || {};
        }
        /**
         * Applies the new ViewSnapshot to this listener, raising a user-facing event
         * if applicable (depending on what changed, whether the user has opted into
         * metadata-only changes, etc.). Returns true if a user-facing event was
         * indeed raised.
         */    no(t) {
            if (!this.options.includeMetadataChanges) {
                // Remove the metadata only changes.
                const e = [];
                for (const n of t.docChanges) 3 /* Metadata */ !== n.type && e.push(n);
                t = new Oo(t.query, t.docs, t.oldDocs, e, t.mutatedKeys, t.fromCache, t.syncStateChanged, 
                /* excludesMetadataChanges= */ !0);
            }
            let e = !1;
            return this.io ? this.oo(t) && (this.so.next(t), e = !0) : this.ao(t, this.onlineState) && (this.co(t), 
            e = !0), this.ro = t, e;
        }
        onError(t) {
            this.so.error(t);
        }
        /** Returns whether a snapshot was raised. */    eo(t) {
            this.onlineState = t;
            let e = !1;
            return this.ro && !this.io && this.ao(this.ro, t) && (this.co(this.ro), e = !0), 
            e;
        }
        ao(t, e) {
            // Always raise the first event when we're synced
            if (!t.fromCache) return !0;
            // NOTE: We consider OnlineState.Unknown as online (it should become Offline
            // or Online if we wait long enough).
                    const n = "Offline" /* Offline */ !== e;
            // Don't raise the event if we're online, aren't synced yet (checked
            // above) and are waiting for a sync.
                    return (!this.options.uo || !n) && (!t.docs.isEmpty() || "Offline" /* Offline */ === e);
            // Raise data from cache if we have any documents or we are offline
            }
        oo(t) {
            // We don't need to handle includeDocumentMetadataChanges here because
            // the Metadata only changes have already been stripped out if needed.
            // At this point the only changes we will see are the ones we should
            // propagate.
            if (t.docChanges.length > 0) return !0;
            const e = this.ro && this.ro.hasPendingWrites !== t.hasPendingWrites;
            return !(!t.syncStateChanged && !e) && !0 === this.options.includeMetadataChanges;
            // Generally we should have hit one of the cases above, but it's possible
            // to get here if there were only metadata docChanges and they got
            // stripped out.
            }
        co(t) {
            t = Oo.fromInitialDocuments(t.query, t.docs, t.mutatedKeys, t.fromCache), this.io = !0, 
            this.so.next(t);
        }
    }

    /**
     * Returns a `LoadBundleTaskProgress` representing the progress that the loading
     * has succeeded.
     */
    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    class Ho {
        constructor(t) {
            this.key = t;
        }
    }

    class Jo {
        constructor(t) {
            this.key = t;
        }
    }

    /**
     * View is responsible for computing the final merged truth of what docs are in
     * a query. It gets notified of local and remote changes to docs, and applies
     * the query filters and limits to determine the most correct possible results.
     */ class Yo {
        constructor(t, 
        /** Documents included in the remote target */
        e) {
            this.query = t, this._o = e, this.mo = null, 
            /**
             * A flag whether the view is current with the backend. A view is considered
             * current after it has seen the current flag from the backend and did not
             * lose consistency within the watch stream (e.g. because of an existence
             * filter mismatch).
             */
            this.current = !1, 
            /** Documents in the view but not in the remote target */
            this.yo = Pn(), 
            /** Document Keys that have local changes */
            this.mutatedKeys = Pn(), this.po = be(t), this.Eo = new ko(this.po);
        }
        /**
         * The set of remote documents that the server has told us belongs to the target associated with
         * this view.
         */    get To() {
            return this._o;
        }
        /**
         * Iterates over a set of doc changes, applies the query limit, and computes
         * what the new results should be, what the changes were, and whether we may
         * need to go back to the local cache for more results. Does not make any
         * changes to the view.
         * @param docChanges - The doc changes to apply to this view.
         * @param previousChanges - If this is being called with a refill, then start
         *        with this set of docs and changes instead of the current view.
         * @returns a new set of docs, changes, and refill flag.
         */    Io(t, e) {
            const n = e ? e.Ao : new $o, s = e ? e.Eo : this.Eo;
            let i = e ? e.mutatedKeys : this.mutatedKeys, r = s, o = !1;
            // Track the last doc in a (full) limit. This is necessary, because some
            // update (a delete, or an update moving a doc past the old limit) might
            // mean there is some other document in the local cache that either should
            // come (1) between the old last limit doc and the new last document, in the
            // case of updates, or (2) after the new last document, in the case of
            // deletes. So we keep this doc at the old limit to compare the updates to.
            // Note that this should never get used in a refill (when previousChanges is
            // set), because there will only be adds -- no deletes or updates.
            const a = we(this.query) && s.size === this.query.limit ? s.last() : null, c = _e(this.query) && s.size === this.query.limit ? s.first() : null;
            // Drop documents out to meet limit/limitToLast requirement.
            if (t.inorderTraversal(((t, e) => {
                const u = s.get(t), h = Pe(this.query, e) ? e : null, l = !!u && this.mutatedKeys.has(u.key), f = !!h && (h.hasLocalMutations || 
                // We only consider committed mutations for documents that were
                // mutated during the lifetime of the view.
                this.mutatedKeys.has(h.key) && h.hasCommittedMutations);
                let d = !1;
                // Calculate change
                            if (u && h) {
                    u.data.isEqual(h.data) ? l !== f && (n.track({
                        type: 3 /* Metadata */ ,
                        doc: h
                    }), d = !0) : this.Ro(u, h) || (n.track({
                        type: 2 /* Modified */ ,
                        doc: h
                    }), d = !0, (a && this.po(h, a) > 0 || c && this.po(h, c) < 0) && (
                    // This doc moved from inside the limit to outside the limit.
                    // That means there may be some other doc in the local cache
                    // that should be included instead.
                    o = !0));
                } else !u && h ? (n.track({
                    type: 0 /* Added */ ,
                    doc: h
                }), d = !0) : u && !h && (n.track({
                    type: 1 /* Removed */ ,
                    doc: u
                }), d = !0, (a || c) && (
                // A doc was removed from a full limit query. We'll need to
                // requery from the local cache to see if we know about some other
                // doc that should be in the results.
                o = !0));
                d && (h ? (r = r.add(h), i = f ? i.add(t) : i.delete(t)) : (r = r.delete(t), i = i.delete(t)));
            })), we(this.query) || _e(this.query)) for (;r.size > this.query.limit; ) {
                const t = we(this.query) ? r.last() : r.first();
                r = r.delete(t.key), i = i.delete(t.key), n.track({
                    type: 1 /* Removed */ ,
                    doc: t
                });
            }
            return {
                Eo: r,
                Ao: n,
                Ln: o,
                mutatedKeys: i
            };
        }
        Ro(t, e) {
            // We suppress the initial change event for documents that were modified as
            // part of a write acknowledgment (e.g. when the value of a server transform
            // is applied) as Watch will send us the same document again.
            // By suppressing the event, we only raise two user visible events (one with
            // `hasPendingWrites` and the final state of the document) instead of three
            // (one with `hasPendingWrites`, the modified document with
            // `hasPendingWrites` and the final state of the document).
            return t.hasLocalMutations && e.hasCommittedMutations && !e.hasLocalMutations;
        }
        /**
         * Updates the view with the given ViewDocumentChanges and optionally updates
         * limbo docs and sync state from the provided target change.
         * @param docChanges - The set of changes to make to the view's docs.
         * @param updateLimboDocuments - Whether to update limbo documents based on
         *        this change.
         * @param targetChange - A target change to apply for computing limbo docs and
         *        sync state.
         * @returns A new ViewChange with the given docs, changes, and sync state.
         */
        // PORTING NOTE: The iOS/Android clients always compute limbo document changes.
        applyChanges(t, e, n) {
            const s = this.Eo;
            this.Eo = t.Eo, this.mutatedKeys = t.mutatedKeys;
            // Sort changes based on type and query comparator
            const i = t.Ao.Yr();
            i.sort(((t, e) => function(t, e) {
                const n = t => {
                    switch (t) {
                      case 0 /* Added */ :
                        return 1;

                      case 2 /* Modified */ :
                      case 3 /* Metadata */ :
                        // A metadata change is converted to a modified change at the public
                        // api layer.  Since we sort by document key and then change type,
                        // metadata and modified changes must be sorted equivalently.
                        return 2;

                      case 1 /* Removed */ :
                        return 0;

                      default:
                        return M$1();
                    }
                };
                return n(t) - n(e);
            }
            /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ (t.type, e.type) || this.po(t.doc, e.doc))), this.Po(n);
            const r = e ? this.bo() : [], o = 0 === this.yo.size && this.current ? 1 /* Synced */ : 0 /* Local */ , a = o !== this.mo;
            if (this.mo = o, 0 !== i.length || a) {
                return {
                    snapshot: new Oo(this.query, t.Eo, s, i, t.mutatedKeys, 0 /* Local */ === o, a, 
                    /* excludesMetadataChanges= */ !1),
                    vo: r
                };
            }
            // no changes
            return {
                vo: r
            };
        }
        /**
         * Applies an OnlineState change to the view, potentially generating a
         * ViewChange if the view's syncState changes as a result.
         */    eo(t) {
            return this.current && "Offline" /* Offline */ === t ? (
            // If we're offline, set `current` to false and then call applyChanges()
            // to refresh our syncState and generate a ViewChange as appropriate. We
            // are guaranteed to get a new TargetChange that sets `current` back to
            // true once the client is back online.
            this.current = !1, this.applyChanges({
                Eo: this.Eo,
                Ao: new $o,
                mutatedKeys: this.mutatedKeys,
                Ln: !1
            }, 
            /* updateLimboDocuments= */ !1)) : {
                vo: []
            };
        }
        /**
         * Returns whether the doc for the given key should be in limbo.
         */    Vo(t) {
            // If the remote end says it's part of this query, it's not in limbo.
            return !this._o.has(t) && (
            // The local store doesn't think it's a result, so it shouldn't be in limbo.
            !!this.Eo.has(t) && !this.Eo.get(t).hasLocalMutations);
        }
        /**
         * Updates syncedDocuments, current, and limbo docs based on the given change.
         * Returns the list of changes to which docs are in limbo.
         */    Po(t) {
            t && (t.addedDocuments.forEach((t => this._o = this._o.add(t))), t.modifiedDocuments.forEach((t => {})), 
            t.removedDocuments.forEach((t => this._o = this._o.delete(t))), this.current = t.current);
        }
        bo() {
            // We can only determine limbo documents when we're in-sync with the server.
            if (!this.current) return [];
            // TODO(klimt): Do this incrementally so that it's not quadratic when
            // updating many documents.
                    const t = this.yo;
            this.yo = Pn(), this.Eo.forEach((t => {
                this.Vo(t.key) && (this.yo = this.yo.add(t.key));
            }));
            // Diff the new limbo docs with the old limbo docs.
            const e = [];
            return t.forEach((t => {
                this.yo.has(t) || e.push(new Jo(t));
            })), this.yo.forEach((n => {
                t.has(n) || e.push(new Ho(n));
            })), e;
        }
        /**
         * Update the in-memory state of the current view with the state read from
         * persistence.
         *
         * We update the query view whenever a client's primary status changes:
         * - When a client transitions from primary to secondary, it can miss
         *   LocalStorage updates and its query views may temporarily not be
         *   synchronized with the state on disk.
         * - For secondary to primary transitions, the client needs to update the list
         *   of `syncedDocuments` since secondary clients update their query views
         *   based purely on synthesized RemoteEvents.
         *
         * @param queryResult.documents - The documents that match the query according
         * to the LocalStore.
         * @param queryResult.remoteKeys - The keys of the documents that match the
         * query according to the backend.
         *
         * @returns The ViewChange that resulted from this synchronization.
         */
        // PORTING NOTE: Multi-tab only.
        So(t) {
            this._o = t.Gn, this.yo = Pn();
            const e = this.Io(t.documents);
            return this.applyChanges(e, /*updateLimboDocuments=*/ !0);
        }
        /**
         * Returns a view snapshot as if this query was just listened to. Contains
         * a document add for every existing document and the `fromCache` and
         * `hasPendingWrites` status of the already established view.
         */
        // PORTING NOTE: Multi-tab only.
        Do() {
            return Oo.fromInitialDocuments(this.query, this.Eo, this.mutatedKeys, 0 /* Local */ === this.mo);
        }
    }

    /**
     * QueryView contains all of the data that SyncEngine needs to keep track of for
     * a particular query.
     */
    class Xo {
        constructor(
        /**
         * The query itself.
         */
        t, 
        /**
         * The target number created by the client that is used in the watch
         * stream to identify this query.
         */
        e, 
        /**
         * The view is responsible for computing the final merged truth of what
         * docs are in the query. It gets notified of local and remote changes,
         * and applies the query filters and limits to determine the most correct
         * possible results.
         */
        n) {
            this.query = t, this.targetId = e, this.view = n;
        }
    }

    /** Tracks a limbo resolution. */ class Zo {
        constructor(t) {
            this.key = t, 
            /**
             * Set to true once we've received a document. This is used in
             * getRemoteKeysForTarget() and ultimately used by WatchChangeAggregator to
             * decide whether it needs to manufacture a delete event for the target once
             * the target is CURRENT.
             */
            this.Co = !1;
        }
    }

    /**
     * An implementation of `SyncEngine` coordinating with other parts of SDK.
     *
     * The parts of SyncEngine that act as a callback to RemoteStore need to be
     * registered individually. This is done in `syncEngineWrite()` and
     * `syncEngineListen()` (as well as `applyPrimaryState()`) as these methods
     * serve as entry points to RemoteStore's functionality.
     *
     * Note: some field defined in this class might have public access level, but
     * the class is not exported so they are only accessible from this module.
     * This is useful to implement optional features (like bundles) in free
     * functions, such that they are tree-shakeable.
     */ class ta$1 {
        constructor(t, e, n, 
        // PORTING NOTE: Manages state synchronization in multi-tab environments.
        s, i, r) {
            this.localStore = t, this.remoteStore = e, this.eventManager = n, this.sharedClientState = s, 
            this.currentUser = i, this.maxConcurrentLimboResolutions = r, this.No = {}, this.xo = new Ki((t => Ae(t)), Ie), 
            this.ko = new Map, 
            /**
             * The keys of documents that are in limbo for which we haven't yet started a
             * limbo resolution query. The strings in this set are the result of calling
             * `key.path.canonicalString()` where `key` is a `DocumentKey` object.
             *
             * The `Set` type was chosen because it provides efficient lookup and removal
             * of arbitrary elements and it also maintains insertion order, providing the
             * desired queue-like FIFO semantics.
             */
            this.$o = new Set, 
            /**
             * Keeps track of the target ID for each document that is in limbo with an
             * active target.
             */
            this.Oo = new dn(Pt.comparator), 
            /**
             * Keeps track of the information about an active limbo resolution for each
             * active target ID that was started for the purpose of limbo resolution.
             */
            this.Fo = new Map, this.Mo = new Rr, 
            /** Stores user completion handlers, indexed by User and BatchId. */
            this.Lo = {}, 
            /** Stores user callbacks waiting for all pending writes to be acknowledged. */
            this.Bo = new Map, this.Uo = Ci.ie(), this.onlineState = "Unknown" /* Unknown */ , 
            // The primary state is set to `true` or `false` immediately after Firestore
            // startup. In the interim, a client should only be considered primary if
            // `isPrimary` is true.
            this.qo = void 0;
        }
        get isPrimaryClient() {
            return !0 === this.qo;
        }
    }

    /**
     * Initiates the new listen, resolves promise when listen enqueued to the
     * server. All the subsequent view snapshots or errors are sent to the
     * subscribed handlers. Returns the initial snapshot.
     */
    async function ea$1(t, e) {
        const n = Da(t);
        let s, i;
        const r = n.xo.get(e);
        if (r) 
        // PORTING NOTE: With Multi-Tab Web, it is possible that a query view
        // already exists when EventManager calls us for the first time. This
        // happens when the primary tab is already listening to this query on
        // behalf of another tab and the user of the primary also starts listening
        // to the query. EventManager will not have an assigned target ID in this
        // case and calls `listen` to obtain this ID.
        s = r.targetId, n.sharedClientState.addLocalQueryTarget(s), i = r.view.Do(); else {
            const t = await _r(n.localStore, Ee(e)), r = n.sharedClientState.addLocalQueryTarget(t.targetId);
            s = t.targetId, i = await na$1(n, e, s, "current" === r), n.isPrimaryClient && oo(n.remoteStore, t);
        }
        return i;
    }

    /**
     * Registers a view for a previously unknown query and computes its initial
     * snapshot.
     */ async function na$1(t, e, n, s) {
        // PORTING NOTE: On Web only, we inject the code that registers new Limbo
        // targets based on view changes. This allows us to only depend on Limbo
        // changes when user code includes queries.
        t.Ko = (e, n, s) => async function(t, e, n, s) {
            let i = e.view.Io(n);
            i.Ln && (
            // The query has a limit and some docs were removed, so we need
            // to re-run the query against the local store to make sure we
            // didn't lose any good docs that had been past the limit.
            i = await gr(t.localStore, e.query, 
            /* usePreviousResults= */ !1).then((({documents: t}) => e.view.Io(t, i))));
            const r = s && s.targetChanges.get(e.targetId), o = e.view.applyChanges(i, 
            /* updateLimboDocuments= */ t.isPrimaryClient, r);
            return _a$1(t, e.targetId, o.vo), o.snapshot;
        }(t, e, n, s);
        const i = await gr(t.localStore, e, 
        /* usePreviousResults= */ !0), r = new Yo(e, i.Gn), o = r.Io(i.documents), a = Sn.createSynthesizedTargetChangeForCurrentChange(n, s && "Offline" /* Offline */ !== t.onlineState), c = r.applyChanges(o, 
        /* updateLimboDocuments= */ t.isPrimaryClient, a);
        _a$1(t, n, c.vo);
        const u = new Xo(e, n, r);
        return t.xo.set(e, u), t.ko.has(n) ? t.ko.get(n).push(e) : t.ko.set(n, [ e ]), c.snapshot;
    }

    /** Stops listening to the query. */ async function sa$1(t, e) {
        const n = U$1(t), s = n.xo.get(e), i = n.ko.get(s.targetId);
        if (i.length > 1) return n.ko.set(s.targetId, i.filter((t => !Ie(t, e)))), void n.xo.delete(e);
        // No other queries are mapped to the target, clean up the query and the target.
            if (n.isPrimaryClient) {
            // We need to remove the local query target first to allow us to verify
            // whether any other client is still interested in this target.
            n.sharedClientState.removeLocalQueryTarget(s.targetId);
            n.sharedClientState.isActiveQueryTarget(s.targetId) || await mr(n.localStore, s.targetId, 
            /*keepPersistedTargetData=*/ !1).then((() => {
                n.sharedClientState.clearQueryState(s.targetId), ao(n.remoteStore, s.targetId), 
                da$1(n, s.targetId);
            })).catch(Oi);
        } else da$1(n, s.targetId), await mr(n.localStore, s.targetId, 
        /*keepPersistedTargetData=*/ !0);
    }

    /**
     * Initiates the write of local mutation batch which involves adding the
     * writes to the mutation queue, notifying the remote store about new
     * mutations and raising events for any changes this write caused.
     *
     * The promise returned by this call is resolved when the above steps
     * have completed, *not* when the write was acked by the backend. The
     * userCallback is resolved once the write was acked/rejected by the
     * backend (or failed locally for any other reason).
     */ async function ia$1(t, e, n) {
        const s = Ca$1(t);
        try {
            const t = await function(t, e) {
                const n = U$1(t), s = st.now(), i = e.reduce(((t, e) => t.add(e.key)), Pn());
                let r;
                return n.persistence.runTransaction("Locally write mutations", "readwrite", (t => n.Qn.bn(t, i).next((i => {
                    r = i;
                    // For non-idempotent mutations (such as `FieldValue.increment()`),
                    // we record the base state in a separate patch mutation. This is
                    // later used to guarantee consistent values and prevents flicker
                    // even if the backend sends us an update that already includes our
                    // transform.
                    const o = [];
                    for (const t of e) {
                        const e = Ye(t, r.get(t.key));
                        null != e && 
                        // NOTE: The base state should only be applied if there's some
                        // existing document to override, so use a Precondition of
                        // exists=true
                        o.push(new en(t.key, e, Ut(e.value.mapValue), We.exists(!0)));
                    }
                    return n.In.addMutationBatch(t, s, o, e);
                })))).then((t => (t.applyToLocalDocumentSet(r), {
                    batchId: t.batchId,
                    changes: r
                })));
            }(s.localStore, e);
            s.sharedClientState.addPendingMutation(t.batchId), function(t, e, n) {
                let s = t.Lo[t.currentUser.toKey()];
                s || (s = new dn(tt));
                s = s.insert(e, n), t.Lo[t.currentUser.toKey()] = s;
            }
            /**
     * Resolves or rejects the user callback for the given batch and then discards
     * it.
     */ (s, t.batchId, n), await ya$1(s, t.changes), await Eo(s.remoteStore);
        } catch (t) {
            // If we can't persist the mutation, we reject the user callback and
            // don't send the mutation. The user can then retry the write.
            const e = xo(t, "Failed to persist write");
            n.reject(e);
        }
    }

    /**
     * Applies one remote event to the sync engine, notifying any views of the
     * changes, and releasing any pending mutation batches that would become
     * visible because of the snapshot version the remote event contains.
     */ async function ra$1(t, e) {
        const n = U$1(t);
        try {
            const t = await fr(n.localStore, e);
            // Update `receivedDocument` as appropriate for any limbo targets.
                    e.targetChanges.forEach(((t, e) => {
                const s = n.Fo.get(e);
                s && (
                // Since this is a limbo resolution lookup, it's for a single document
                // and it could be added, modified, or removed, but not a combination.
                L$1(t.addedDocuments.size + t.modifiedDocuments.size + t.removedDocuments.size <= 1), 
                t.addedDocuments.size > 0 ? s.Co = !0 : t.modifiedDocuments.size > 0 ? L$1(s.Co) : t.removedDocuments.size > 0 && (L$1(s.Co), 
                s.Co = !1));
            })), await ya$1(n, t, e);
        } catch (t) {
            await Oi(t);
        }
    }

    /**
     * Applies an OnlineState change to the sync engine and notifies any views of
     * the change.
     */ function oa$1(t, e, n) {
        const s = U$1(t);
        // If we are the secondary client, we explicitly ignore the remote store's
        // online state (the local client may go offline, even though the primary
        // tab remains online) and only apply the primary tab's online state from
        // SharedClientState.
            if (s.isPrimaryClient && 0 /* RemoteStore */ === n || !s.isPrimaryClient && 1 /* SharedClientState */ === n) {
            const t = [];
            s.xo.forEach(((n, s) => {
                const i = s.view.eo(e);
                i.snapshot && t.push(i.snapshot);
            })), function(t, e) {
                const n = U$1(t);
                n.onlineState = e;
                let s = !1;
                n.queries.forEach(((t, n) => {
                    for (const t of n.listeners) 
                    // Run global snapshot listeners if a consistent snapshot has been emitted.
                    t.eo(e) && (s = !0);
                })), s && Ko(n);
            }(s.eventManager, e), t.length && s.No.Tr(t), s.onlineState = e, s.isPrimaryClient && s.sharedClientState.setOnlineState(e);
        }
    }

    /**
     * Rejects the listen for the given targetID. This can be triggered by the
     * backend for any active target.
     *
     * @param syncEngine - The sync engine implementation.
     * @param targetId - The targetID corresponds to one previously initiated by the
     * user as part of TargetData passed to listen() on RemoteStore.
     * @param err - A description of the condition that has forced the rejection.
     * Nearly always this will be an indication that the user is no longer
     * authorized to see the data matching the target.
     */ async function aa$1(t, e, n) {
        const s = U$1(t);
        // PORTING NOTE: Multi-tab only.
            s.sharedClientState.updateQueryState(e, "rejected", n);
        const i = s.Fo.get(e), r = i && i.key;
        if (r) {
            // TODO(klimt): We really only should do the following on permission
            // denied errors, but we don't have the cause code here.
            // It's a limbo doc. Create a synthetic event saying it was deleted.
            // This is kind of a hack. Ideally, we would have a method in the local
            // store to purge a document. However, it would be tricky to keep all of
            // the local store's invariants with another method.
            let t = new dn(Pt.comparator);
            t = t.insert(r, qt.newNoDocument(r, it.min()));
            const n = Pn().add(r), i = new Vn(it.min(), 
            /* targetChanges= */ new Map, 
            /* targetMismatches= */ new mn(tt), t, n);
            await ra$1(s, i), 
            // Since this query failed, we won't want to manually unlisten to it.
            // We only remove it from bookkeeping after we successfully applied the
            // RemoteEvent. If `applyRemoteEvent()` throws, we want to re-listen to
            // this query when the RemoteStore restarts the Watch stream, which should
            // re-trigger the target failure.
            s.Oo = s.Oo.remove(r), s.Fo.delete(e), ga(s);
        } else await mr(s.localStore, e, 
        /* keepPersistedTargetData */ !1).then((() => da$1(s, e, n))).catch(Oi);
    }

    async function ca(t, e) {
        const n = U$1(t), s = e.batch.batchId;
        try {
            const t = await hr(n.localStore, e);
            // The local store may or may not be able to apply the write result and
            // raise events immediately (depending on whether the watcher is caught
            // up), so we raise user callbacks first so that they consistently happen
            // before listen events.
                    fa$1(n, s, /*error=*/ null), la(n, s), n.sharedClientState.updateMutationState(s, "acknowledged"), 
            await ya$1(n, t);
        } catch (t) {
            await Oi(t);
        }
    }

    async function ua$1(t, e, n) {
        const s = U$1(t);
        try {
            const t = await function(t, e) {
                const n = U$1(t);
                return n.persistence.runTransaction("Reject batch", "readwrite-primary", (t => {
                    let s;
                    return n.In.lookupMutationBatch(t, e).next((e => (L$1(null !== e), s = e.keys(), n.In.removeMutationBatch(t, e)))).next((() => n.In.performConsistencyCheck(t))).next((() => n.Qn.bn(t, s)));
                }));
            }
            /**
     * Returns the largest (latest) batch id in mutation queue that is pending
     * server response.
     *
     * Returns `BATCHID_UNKNOWN` if the queue is empty.
     */ (s.localStore, e);
            // The local store may or may not be able to apply the write result and
            // raise events immediately (depending on whether the watcher is caught up),
            // so we raise user callbacks first so that they consistently happen before
            // listen events.
                    fa$1(s, e, n), la(s, e), s.sharedClientState.updateMutationState(e, "rejected", n), 
            await ya$1(s, t);
        } catch (n) {
            await Oi(n);
        }
    }

    /**
     * Triggers the callbacks that are waiting for this batch id to get acknowledged by server,
     * if there are any.
     */ function la(t, e) {
        (t.Bo.get(e) || []).forEach((t => {
            t.resolve();
        })), t.Bo.delete(e);
    }

    /** Reject all outstanding callbacks waiting for pending writes to complete. */ function fa$1(t, e, n) {
        const s = U$1(t);
        let i = s.Lo[s.currentUser.toKey()];
        // NOTE: Mutations restored from persistence won't have callbacks, so it's
        // okay for there to be no callback for this ID.
            if (i) {
            const t = i.get(e);
            t && (n ? t.reject(n) : t.resolve(), i = i.remove(e)), s.Lo[s.currentUser.toKey()] = i;
        }
    }

    function da$1(t, e, n = null) {
        t.sharedClientState.removeLocalQueryTarget(e);
        for (const s of t.ko.get(e)) t.xo.delete(s), n && t.No.jo(s, n);
        if (t.ko.delete(e), t.isPrimaryClient) {
            t.Mo.cs(e).forEach((e => {
                t.Mo.containsKey(e) || 
                // We removed the last reference for this key
                wa$1(t, e);
            }));
        }
    }

    function wa$1(t, e) {
        t.$o.delete(e.path.canonicalString());
        // It's possible that the target already got removed because the query failed. In that case,
        // the key won't exist in `limboTargetsByKey`. Only do the cleanup if we still have the target.
        const n = t.Oo.get(e);
        null !== n && (ao(t.remoteStore, n), t.Oo = t.Oo.remove(e), t.Fo.delete(n), ga(t));
    }

    function _a$1(t, e, n) {
        for (const s of n) if (s instanceof Ho) t.Mo.addReference(s.key, e), ma$1(t, s); else if (s instanceof Jo) {
            k$1("SyncEngine", "Document no longer in limbo: " + s.key), t.Mo.removeReference(s.key, e);
            t.Mo.containsKey(s.key) || 
            // We removed the last reference for this key
            wa$1(t, s.key);
        } else M$1();
    }

    function ma$1(t, e) {
        const n = e.key, s = n.path.canonicalString();
        t.Oo.get(n) || t.$o.has(s) || (k$1("SyncEngine", "New document in limbo: " + n), t.$o.add(s), 
        ga(t));
    }

    /**
     * Starts listens for documents in limbo that are enqueued for resolution,
     * subject to a maximum number of concurrent resolutions.
     *
     * Without bounding the number of concurrent resolutions, the server can fail
     * with "resource exhausted" errors which can lead to pathological client
     * behavior as seen in https://github.com/firebase/firebase-js-sdk/issues/2683.
     */ function ga(t) {
        for (;t.$o.size > 0 && t.Oo.size < t.maxConcurrentLimboResolutions; ) {
            const e = t.$o.values().next().value;
            t.$o.delete(e);
            const n = new Pt(ut.fromString(e)), s = t.Uo.next();
            t.Fo.set(s, new Zo(n)), t.Oo = t.Oo.insert(n, s), oo(t.remoteStore, new si(Ee(de(n.path)), s, 2 /* LimboResolution */ , Y$1.T));
        }
    }

    async function ya$1(t, e, n) {
        const s = U$1(t), i = [], r = [], o = [];
        s.xo.isEmpty() || (s.xo.forEach(((t, a) => {
            o.push(s.Ko(a, e, n).then((t => {
                if (t) {
                    s.isPrimaryClient && s.sharedClientState.updateQueryState(a.targetId, t.fromCache ? "not-current" : "current"), 
                    i.push(t);
                    const e = rr.kn(a.targetId, t);
                    r.push(e);
                }
            })));
        })), await Promise.all(o), s.No.Tr(i), await async function(t, e) {
            const n = U$1(t);
            try {
                await n.persistence.runTransaction("notifyLocalViewChanges", "readwrite", (t => Ks.forEach(e, (e => Ks.forEach(e.Nn, (s => n.persistence.referenceDelegate.addReference(t, e.targetId, s))).next((() => Ks.forEach(e.xn, (s => n.persistence.referenceDelegate.removeReference(t, e.targetId, s)))))))));
            } catch (t) {
                if (!zs(t)) throw t;
                // If `notifyLocalViewChanges` fails, we did not advance the sequence
                // number for the documents that were included in this transaction.
                // This might trigger them to be deleted earlier than they otherwise
                // would have, but it should not invalidate the integrity of the data.
                k$1("LocalStore", "Failed to update sequence numbers: " + t);
            }
            for (const t of e) {
                const e = t.targetId;
                if (!t.fromCache) {
                    const t = n.Un.get(e), s = t.snapshotVersion, i = t.withLastLimboFreeSnapshotVersion(s);
                    // Advance the last limbo free snapshot version
                                    n.Un = n.Un.insert(e, i);
                }
            }
        }(s.localStore, r));
    }

    async function pa$1(t, e) {
        const n = U$1(t);
        if (!n.currentUser.isEqual(e)) {
            k$1("SyncEngine", "User change. New user:", e.toKey());
            const t = await ur(n.localStore, e);
            n.currentUser = e, 
            // Fails tasks waiting for pending writes requested by previous user.
            function(t, e) {
                t.Bo.forEach((t => {
                    t.forEach((t => {
                        t.reject(new K$1(q$1.CANCELLED, e));
                    }));
                })), t.Bo.clear();
            }(n, "'waitForPendingWrites' promise is rejected due to a user change."), 
            // TODO(b/114226417): Consider calling this only in the primary tab.
            n.sharedClientState.handleUserChange(e, t.removedBatchIds, t.addedBatchIds), await ya$1(n, t.Wn);
        }
    }

    function Ea(t, e) {
        const n = U$1(t), s = n.Fo.get(e);
        if (s && s.Co) return Pn().add(s.key);
        {
            let t = Pn();
            const s = n.ko.get(e);
            if (!s) return t;
            for (const e of s) {
                const s = n.xo.get(e);
                t = t.unionWith(s.view.To);
            }
            return t;
        }
    }

    function Da(t) {
        const e = U$1(t);
        return e.remoteStore.remoteSyncer.applyRemoteEvent = ra$1.bind(null, e), e.remoteStore.remoteSyncer.getRemoteKeysForTarget = Ea.bind(null, e), 
        e.remoteStore.remoteSyncer.rejectListen = aa$1.bind(null, e), e.No.Tr = Uo.bind(null, e.eventManager), 
        e.No.jo = qo.bind(null, e.eventManager), e;
    }

    function Ca$1(t) {
        const e = U$1(t);
        return e.remoteStore.remoteSyncer.applySuccessfulWrite = ca.bind(null, e), e.remoteStore.remoteSyncer.rejectFailedWrite = ua$1.bind(null, e), 
        e;
    }

    class xa$1 {
        constructor() {
            this.synchronizeTabs = !1;
        }
        async initialize(t) {
            this.N = Jr(t.databaseInfo.databaseId), this.sharedClientState = this.Wo(t), this.persistence = this.Go(t), 
            await this.persistence.start(), this.gcScheduler = this.zo(t), this.localStore = this.Ho(t);
        }
        zo(t) {
            return null;
        }
        Ho(t) {
            return cr(this.persistence, new or, t.initialUser, this.N);
        }
        Go(t) {
            return new Dr(Nr.Ns, this.N);
        }
        Wo(t) {
            return new qr;
        }
        async terminate() {
            this.gcScheduler && this.gcScheduler.stop(), await this.sharedClientState.shutdown(), 
            await this.persistence.shutdown();
        }
    }

    /**
     * Initializes and wires the components that are needed to interface with the
     * network.
     */ class Oa$1 {
        async initialize(t, e) {
            this.localStore || (this.localStore = t.localStore, this.sharedClientState = t.sharedClientState, 
            this.datastore = this.createDatastore(e), this.remoteStore = this.createRemoteStore(e), 
            this.eventManager = this.createEventManager(e), this.syncEngine = this.createSyncEngine(e, 
            /* startAsPrimary=*/ !t.synchronizeTabs), this.sharedClientState.onlineStateHandler = t => oa$1(this.syncEngine, t, 1 /* SharedClientState */), 
            this.remoteStore.remoteSyncer.handleCredentialChange = pa$1.bind(null, this.syncEngine), 
            await So(this.remoteStore, this.syncEngine.isPrimaryClient));
        }
        createEventManager(t) {
            return new Mo;
        }
        createDatastore(t) {
            const e = Jr(t.databaseInfo.databaseId), n = (s = t.databaseInfo, new Gr(s));
            var s;
            /** Return the Platform-specific connectivity monitor. */        return function(t, e, n) {
                return new eo(t, e, n);
            }(t.credentials, n, e);
        }
        createRemoteStore(t) {
            return e = this.localStore, n = this.datastore, s = t.asyncQueue, i = t => oa$1(this.syncEngine, t, 0 /* RemoteStore */), 
            r = jr.Pt() ? new jr : new Kr, new so(e, n, s, i, r);
            var e, n, s, i, r;
            /** Re-enables the network. Idempotent. */    }
        createSyncEngine(t, e) {
            return function(t, e, n, 
            // PORTING NOTE: Manages state synchronization in multi-tab environments.
            s, i, r, o) {
                const a = new ta$1(t, e, n, s, i, r);
                return o && (a.qo = !0), a;
            }(this.localStore, this.remoteStore, this.eventManager, this.sharedClientState, t.initialUser, t.maxConcurrentLimboResolutions, e);
        }
        terminate() {
            return async function(t) {
                const e = U$1(t);
                k$1("RemoteStore", "RemoteStore shutting down."), e.Kr.add(5 /* Shutdown */), await ro(e), 
                e.Qr.shutdown(), 
                // Set the OnlineState to Unknown (rather than Offline) to avoid potentially
                // triggering spurious listener events with cached data, etc.
                e.Wr.set("Unknown" /* Unknown */);
            }(this.remoteStore);
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * On web, a `ReadableStream` is wrapped around by a `ByteStreamReader`.
     */
    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /*
     * A wrapper implementation of Observer<T> that will dispatch events
     * asynchronously. To allow immediate silencing, a mute call is added which
     * causes events scheduled to no longer be raised.
     */
    class Ma$1 {
        constructor(t) {
            this.observer = t, 
            /**
             * When set to true, will not raise future events. Necessary to deal with
             * async detachment of listener.
             */
            this.muted = !1;
        }
        next(t) {
            this.observer.next && this.Yo(this.observer.next, t);
        }
        error(t) {
            this.observer.error ? this.Yo(this.observer.error, t) : console.error("Uncaught Error in snapshot listener:", t);
        }
        Xo() {
            this.muted = !0;
        }
        Yo(t, e) {
            this.muted || setTimeout((() => {
                this.muted || t(e);
            }), 0);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * FirestoreClient is a top-level class that constructs and owns all of the
     * pieces of the client SDK architecture. It is responsible for creating the
     * async queue that is shared by all of the other components in the system.
     */
    class qa$1 {
        constructor(t, 
        /**
         * Asynchronous queue responsible for all of our internal processing. When
         * we get incoming work from the user (via public API) or the network
         * (incoming GRPC messages), we should always schedule onto this queue.
         * This ensures all of our work is properly serialized (e.g. we don't
         * start processing a new operation while the previous one is waiting for
         * an async I/O to complete).
         */
        e, n) {
            this.credentials = t, this.asyncQueue = e, this.databaseInfo = n, this.user = S$1.UNAUTHENTICATED, 
            this.clientId = Z$1.I(), this.credentialListener = () => Promise.resolve(), this.credentials.start(e, (async t => {
                k$1("FirestoreClient", "Received user=", t.uid), await this.credentialListener(t), 
                this.user = t;
            }));
        }
        async getConfiguration() {
            return {
                asyncQueue: this.asyncQueue,
                databaseInfo: this.databaseInfo,
                clientId: this.clientId,
                credentials: this.credentials,
                initialUser: this.user,
                maxConcurrentLimboResolutions: 100
            };
        }
        setCredentialChangeListener(t) {
            this.credentialListener = t;
        }
        /**
         * Checks that the client has not been terminated. Ensures that other methods on
         * this class cannot be called after the client is terminated.
         */    verifyNotTerminated() {
            if (this.asyncQueue.isShuttingDown) throw new K$1(q$1.FAILED_PRECONDITION, "The client has already been terminated.");
        }
        terminate() {
            this.asyncQueue.enterRestrictedMode();
            const t = new j;
            return this.asyncQueue.enqueueAndForgetEvenWhileRestricted((async () => {
                try {
                    this.onlineComponents && await this.onlineComponents.terminate(), this.offlineComponents && await this.offlineComponents.terminate(), 
                    // The credentials provider must be terminated after shutting down the
                    // RemoteStore as it will prevent the RemoteStore from retrieving auth
                    // tokens.
                    this.credentials.shutdown(), t.resolve();
                } catch (e) {
                    const n = xo(e, "Failed to shutdown persistence");
                    t.reject(n);
                }
            })), t.promise;
        }
    }

    async function Ka$1(t, e) {
        t.asyncQueue.verifyOperationInProgress(), k$1("FirestoreClient", "Initializing OfflineComponentProvider");
        const n = await t.getConfiguration();
        await e.initialize(n);
        let s = n.initialUser;
        t.setCredentialChangeListener((async t => {
            s.isEqual(t) || (await ur(e.localStore, t), s = t);
        })), 
        // When a user calls clearPersistence() in one client, all other clients
        // need to be terminated to allow the delete to succeed.
        e.persistence.setDatabaseDeletedListener((() => t.terminate())), t.offlineComponents = e;
    }

    async function ja$1(t, e) {
        t.asyncQueue.verifyOperationInProgress();
        const n = await Qa$1(t);
        k$1("FirestoreClient", "Initializing OnlineComponentProvider");
        const s = await t.getConfiguration();
        await e.initialize(n, s), 
        // The CredentialChangeListener of the online component provider takes
        // precedence over the offline component provider.
        t.setCredentialChangeListener((t => async function(t, e) {
            const n = U$1(t);
            n.asyncQueue.verifyOperationInProgress(), k$1("RemoteStore", "RemoteStore received new credentials");
            const s = fo(n);
            // Tear down and re-create our network streams. This will ensure we get a
            // fresh auth token for the new user and re-fill the write pipeline with
            // new mutations from the LocalStore (since mutations are per-user).
                    n.Kr.add(3 /* CredentialChange */), await ro(n), s && 
            // Don't set the network status to Unknown if we are offline.
            n.Wr.set("Unknown" /* Unknown */), await n.remoteSyncer.handleCredentialChange(e), 
            n.Kr.delete(3 /* CredentialChange */), await io(n);
        }(e.remoteStore, t))), t.onlineComponents = e;
    }

    async function Qa$1(t) {
        return t.offlineComponents || (k$1("FirestoreClient", "Using default OfflineComponentProvider"), 
        await Ka$1(t, new xa$1)), t.offlineComponents;
    }

    async function Wa$1(t) {
        return t.onlineComponents || (k$1("FirestoreClient", "Using default OnlineComponentProvider"), 
        await ja$1(t, new Oa$1)), t.onlineComponents;
    }

    function Ja$1(t) {
        return Wa$1(t).then((t => t.syncEngine));
    }

    async function Ya$1(t) {
        const e = await Wa$1(t), n = e.eventManager;
        return n.onListen = ea$1.bind(null, e.syncEngine), n.onUnlisten = sa$1.bind(null, e.syncEngine), 
        n;
    }

    function sc$1(t, e, n = {}) {
        const s = new j;
        return t.asyncQueue.enqueueAndForget((async () => function(t, e, n, s, i) {
            const r = new Ma$1({
                next: n => {
                    // Remove query first before passing event to user to avoid
                    // user actions affecting the now stale query.
                    e.enqueueAndForget((() => Bo(t, o))), n.fromCache && "server" === s.source ? i.reject(new K$1(q$1.UNAVAILABLE, 'Failed to get documents from server. (However, these documents may exist in the local cache. Run again without setting source to "server" to retrieve the cached documents.)')) : i.resolve(n);
                },
                error: t => i.reject(t)
            }), o = new jo(n, r, {
                includeMetadataChanges: !0,
                uo: !0
            });
            return Lo(t, o);
        }(await Ya$1(t), t.asyncQueue, e, n, s))), s.promise;
    }

    class cc$1 {
        /**
         * Constructs a DatabaseInfo using the provided host, databaseId and
         * persistenceKey.
         *
         * @param databaseId - The database to use.
         * @param appId - The Firebase App Id.
         * @param persistenceKey - A unique identifier for this Firestore's local
         * storage (used in conjunction with the databaseId).
         * @param host - The Firestore backend host to connect to.
         * @param ssl - Whether to use SSL when connecting.
         * @param forceLongPolling - Whether to use the forceLongPolling option
         * when using WebChannel as the network transport.
         * @param autoDetectLongPolling - Whether to use the detectBufferingProxy
         * option when using WebChannel as the network transport.
         * @param useFetchStreams Whether to use the Fetch API instead of
         * XMLHTTPRequest
         */
        constructor(t, e, n, s, i, r, o, a) {
            this.databaseId = t, this.appId = e, this.persistenceKey = n, this.host = s, this.ssl = i, 
            this.forceLongPolling = r, this.autoDetectLongPolling = o, this.useFetchStreams = a;
        }
    }

    /** The default database name for a project. */
    /**
     * Represents the database ID a Firestore client is associated with.
     * @internal
     */
    class uc$1 {
        constructor(t, e) {
            this.projectId = t, this.database = e || "(default)";
        }
        get isDefaultDatabase() {
            return "(default)" === this.database;
        }
        isEqual(t) {
            return t instanceof uc$1 && t.projectId === this.projectId && t.database === this.database;
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ const hc$1 = new Map;

    /**
     * An instance map that ensures only one Datastore exists per Firestore
     * instance.
     */
    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    function lc$1(t, e, n) {
        if (!n) throw new K$1(q$1.INVALID_ARGUMENT, `Function ${t}() cannot be called with an empty ${e}.`);
    }

    /**
     * Validates that two boolean options are not set at the same time.
     * @internal
     */ function fc$1(t, e, n, s) {
        if (!0 === e && !0 === s) throw new K$1(q$1.INVALID_ARGUMENT, `${t} and ${n} cannot be used together.`);
    }

    /**
     * Validates that `path` refers to a document (indicated by the fact it contains
     * an even numbers of segments).
     */ function dc$1(t) {
        if (!Pt.isDocumentKey(t)) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid document reference. Document references must have an even number of segments, but ${t} has ${t.length}.`);
    }

    /**
     * Validates that `path` refers to a collection (indicated by the fact it
     * contains an odd numbers of segments).
     */ function wc$1(t) {
        if (Pt.isDocumentKey(t)) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid collection reference. Collection references must have an odd number of segments, but ${t} has ${t.length}.`);
    }

    /**
     * Returns true if it's a non-null object without a custom prototype
     * (i.e. excludes Array, Date, etc.).
     */
    /** Returns a string describing the type / value of the provided input. */
    function _c(t) {
        if (void 0 === t) return "undefined";
        if (null === t) return "null";
        if ("string" == typeof t) return t.length > 20 && (t = `${t.substring(0, 20)}...`), 
        JSON.stringify(t);
        if ("number" == typeof t || "boolean" == typeof t) return "" + t;
        if ("object" == typeof t) {
            if (t instanceof Array) return "an array";
            {
                const e = 
                /** Hacky method to try to get the constructor name for an object. */
                function(t) {
                    if (t.constructor) {
                        const e = /function\s+([^\s(]+)\s*\(/.exec(t.constructor.toString());
                        if (e && e.length > 1) return e[1];
                    }
                    return null;
                }
                /**
     * Casts `obj` to `T`, optionally unwrapping Compat types to expose the
     * underlying instance. Throws if  `obj` is not an instance of `T`.
     *
     * This cast is used in the Lite and Full SDK to verify instance types for
     * arguments passed to the public API.
     * @internal
     */ (t);
                return e ? `a custom ${e} object` : "an object";
            }
        }
        return "function" == typeof t ? "a function" : M$1();
    }

    function mc$1(t, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e) {
        if ("_delegate" in t && (
        // Unwrap Compat types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        t = t._delegate), !(t instanceof e)) {
            if (e.name === t.constructor.name) throw new K$1(q$1.INVALID_ARGUMENT, "Type does not match the expected instance. Did you pass a reference from a different Firestore SDK?");
            {
                const n = _c(t);
                throw new K$1(q$1.INVALID_ARGUMENT, `Expected type '${e.name}', but it was: ${n}`);
            }
        }
        return t;
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    // settings() defaults:
    /**
     * A concrete type describing all the values that can be applied via a
     * user-supplied `FirestoreSettings` object. This is a separate type so that
     * defaults can be supplied and the value can be checked for equality.
     */
    class yc$1 {
        constructor(t) {
            var e;
            if (void 0 === t.host) {
                if (void 0 !== t.ssl) throw new K$1(q$1.INVALID_ARGUMENT, "Can't provide ssl option if host option is not set");
                this.host = "firestore.googleapis.com", this.ssl = true;
            } else this.host = t.host, this.ssl = null === (e = t.ssl) || void 0 === e || e;
            if (this.credentials = t.credentials, this.ignoreUndefinedProperties = !!t.ignoreUndefinedProperties, 
            void 0 === t.cacheSizeBytes) this.cacheSizeBytes = 41943040; else {
                if (-1 !== t.cacheSizeBytes && t.cacheSizeBytes < 1048576) throw new K$1(q$1.INVALID_ARGUMENT, "cacheSizeBytes must be at least 1048576");
                this.cacheSizeBytes = t.cacheSizeBytes;
            }
            this.experimentalForceLongPolling = !!t.experimentalForceLongPolling, this.experimentalAutoDetectLongPolling = !!t.experimentalAutoDetectLongPolling, 
            this.useFetchStreams = !!t.useFetchStreams, fc$1("experimentalForceLongPolling", t.experimentalForceLongPolling, "experimentalAutoDetectLongPolling", t.experimentalAutoDetectLongPolling);
        }
        isEqual(t) {
            return this.host === t.host && this.ssl === t.ssl && this.credentials === t.credentials && this.cacheSizeBytes === t.cacheSizeBytes && this.experimentalForceLongPolling === t.experimentalForceLongPolling && this.experimentalAutoDetectLongPolling === t.experimentalAutoDetectLongPolling && this.ignoreUndefinedProperties === t.ignoreUndefinedProperties && this.useFetchStreams === t.useFetchStreams;
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * The Cloud Firestore service interface.
     *
     * Do not call this constructor directly. Instead, use {@link getFirestore}.
     */ class pc$1 {
        /** @hideconstructor */
        constructor(t, e) {
            this._credentials = e, 
            /**
             * Whether it's a Firestore or Firestore Lite instance.
             */
            this.type = "firestore-lite", this._persistenceKey = "(lite)", this._settings = new yc$1({}), 
            this._settingsFrozen = !1, t instanceof uc$1 ? this._databaseId = t : (this._app = t, 
            this._databaseId = function(t) {
                if (!Object.prototype.hasOwnProperty.apply(t.options, [ "projectId" ])) throw new K$1(q$1.INVALID_ARGUMENT, '"projectId" not provided in firebase.initializeApp.');
                return new uc$1(t.options.projectId);
            }
            /**
     * Modify this instance to communicate with the Cloud Firestore emulator.
     *
     * Note: This must be called before this instance has been used to do any
     * operations.
     *
     * @param firestore - The `Firestore` instance to configure to connect to the
     * emulator.
     * @param host - the emulator host (ex: localhost).
     * @param port - the emulator port (ex: 9000).
     * @param options.mockUserToken - the mock auth token to use for unit testing
     * Security Rules.
     */ (t));
        }
        /**
         * The {@link @firebase/app#FirebaseApp} associated with this `Firestore` service
         * instance.
         */    get app() {
            if (!this._app) throw new K$1(q$1.FAILED_PRECONDITION, "Firestore was not initialized using the Firebase SDK. 'app' is not available");
            return this._app;
        }
        get _initialized() {
            return this._settingsFrozen;
        }
        get _terminated() {
            return void 0 !== this._terminateTask;
        }
        _setSettings(t) {
            if (this._settingsFrozen) throw new K$1(q$1.FAILED_PRECONDITION, "Firestore has already been started and its settings can no longer be changed. You can only modify settings before calling any other methods on a Firestore object.");
            this._settings = new yc$1(t), void 0 !== t.credentials && (this._credentials = function(t) {
                if (!t) return new W$1;
                switch (t.type) {
                  case "gapi":
                    const e = t.client;
                    // Make sure this really is a Gapi client.
                                    return L$1(!("object" != typeof e || null === e || !e.auth || !e.auth.getAuthHeaderValueForFirstParty)), 
                    new J$1(e, t.sessionIndex || "0", t.iamToken || null);

                  case "provider":
                    return t.client;

                  default:
                    throw new K$1(q$1.INVALID_ARGUMENT, "makeCredentialsProvider failed due to invalid credential type");
                }
            }(t.credentials));
        }
        _getSettings() {
            return this._settings;
        }
        _freezeSettings() {
            return this._settingsFrozen = !0, this._settings;
        }
        _delete() {
            return this._terminateTask || (this._terminateTask = this._terminate()), this._terminateTask;
        }
        /** Returns a JSON-serializable representation of this `Firestore` instance. */    toJSON() {
            return {
                app: this._app,
                databaseId: this._databaseId,
                settings: this._settings
            };
        }
        /**
         * Terminates all components used by this client. Subclasses can override
         * this method to clean up their own dependencies, but must also call this
         * method.
         *
         * Only ever called once.
         */    _terminate() {
            /**
     * Removes all components associated with the provided instance. Must be called
     * when the `Firestore` instance is terminated.
     */
            return function(t) {
                const e = hc$1.get(t);
                e && (k$1("ComponentProvider", "Removing Datastore"), hc$1.delete(t), e.terminate());
            }(this), Promise.resolve();
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A `DocumentReference` refers to a document location in a Firestore database
     * and can be used to write, read, or listen to the location. The document at
     * the referenced location may or may not exist.
     */ class Tc$1 {
        /** @hideconstructor */
        constructor(t, 
        /**
         * If provided, the `FirestoreDataConverter` associated with this instance.
         */
        e, n) {
            this.converter = e, this._key = n, 
            /** The type of this Firestore reference. */
            this.type = "document", this.firestore = t;
        }
        get _path() {
            return this._key.path;
        }
        /**
         * The document's identifier within its collection.
         */    get id() {
            return this._key.path.lastSegment();
        }
        /**
         * A string representing the path of the referenced document (relative
         * to the root of the database).
         */    get path() {
            return this._key.path.canonicalString();
        }
        /**
         * The collection this `DocumentReference` belongs to.
         */    get parent() {
            return new Ac$1(this.firestore, this.converter, this._key.path.popLast());
        }
        withConverter(t) {
            return new Tc$1(this.firestore, t, this._key);
        }
    }

    /**
     * A `Query` refers to a query which you can read or listen to. You can also
     * construct refined `Query` objects by adding filters and ordering.
     */ class Ic$1 {
        // This is the lite version of the Query class in the main SDK.
        /** @hideconstructor protected */
        constructor(t, 
        /**
         * If provided, the `FirestoreDataConverter` associated with this instance.
         */
        e, n) {
            this.converter = e, this._query = n, 
            /** The type of this Firestore reference. */
            this.type = "query", this.firestore = t;
        }
        withConverter(t) {
            return new Ic$1(this.firestore, t, this._query);
        }
    }

    /**
     * A `CollectionReference` object can be used for adding documents, getting
     * document references, and querying for documents (using {@link query}).
     */ class Ac$1 extends Ic$1 {
        /** @hideconstructor */
        constructor(t, e, n) {
            super(t, e, de(n)), this._path = n, 
            /** The type of this Firestore reference. */
            this.type = "collection";
        }
        /** The collection's identifier. */    get id() {
            return this._query.path.lastSegment();
        }
        /**
         * A string representing the path of the referenced collection (relative
         * to the root of the database).
         */    get path() {
            return this._query.path.canonicalString();
        }
        /**
         * A reference to the containing `DocumentReference` if this is a
         * subcollection. If this isn't a subcollection, the reference is null.
         */    get parent() {
            const t = this._path.popLast();
            return t.isEmpty() ? null : new Tc$1(this.firestore, 
            /* converter= */ null, new Pt(t));
        }
        withConverter(t) {
            return new Ac$1(this.firestore, t, this._path);
        }
    }

    function Rc$1(t, e, ...n) {
        if (t = getModularInstance(t), lc$1("collection", "path", e), t instanceof pc$1) {
            const s = ut.fromString(e, ...n);
            return wc$1(s), new Ac$1(t, /* converter= */ null, s);
        }
        {
            if (!(t instanceof Tc$1 || t instanceof Ac$1)) throw new K$1(q$1.INVALID_ARGUMENT, "Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");
            const s = ut.fromString(t.path, ...n).child(ut.fromString(e));
            return wc$1(s), new Ac$1(t.firestore, 
            /* converter= */ null, s);
        }
    }

    function bc$1(t, e, ...n) {
        if (t = getModularInstance(t), 
        // We allow omission of 'pathString' but explicitly prohibit passing in both
        // 'undefined' and 'null'.
        1 === arguments.length && (e = Z$1.I()), lc$1("doc", "path", e), t instanceof pc$1) {
            const s = ut.fromString(e, ...n);
            return dc$1(s), new Tc$1(t, 
            /* converter= */ null, new Pt(s));
        }
        {
            if (!(t instanceof Tc$1 || t instanceof Ac$1)) throw new K$1(q$1.INVALID_ARGUMENT, "Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");
            const s = t._path.child(ut.fromString(e, ...n));
            return dc$1(s), new Tc$1(t.firestore, t instanceof Ac$1 ? t.converter : null, new Pt(s));
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ class Sc$1 {
        constructor() {
            // The last promise in the queue.
            this.fa = Promise.resolve(), 
            // A list of retryable operations. Retryable operations are run in order and
            // retried with backoff.
            this.da = [], 
            // Is this AsyncQueue being shut down? Once it is set to true, it will not
            // be changed again.
            this.wa = !1, 
            // Operations scheduled to be queued in the future. Operations are
            // automatically removed after they are run or canceled.
            this._a = [], 
            // visible for testing
            this.ma = null, 
            // Flag set while there's an outstanding AsyncQueue operation, used for
            // assertion sanity-checks.
            this.ga = !1, 
            // Enabled during shutdown on Safari to prevent future access to IndexedDB.
            this.ya = !1, 
            // List of TimerIds to fast-forward delays for.
            this.pa = [], 
            // Backoff timer used to schedule retries for retryable operations
            this.rr = new Yr(this, "async_queue_retry" /* AsyncQueueRetry */), 
            // Visibility handler that triggers an immediate retry of all retryable
            // operations. Meant to speed up recovery when we regain file system access
            // after page comes into foreground.
            this.Ea = () => {
                const t = Hr();
                t && k$1("AsyncQueue", "Visibility state changed to " + t.visibilityState), this.rr.tr();
            };
            const t = Hr();
            t && "function" == typeof t.addEventListener && t.addEventListener("visibilitychange", this.Ea);
        }
        get isShuttingDown() {
            return this.wa;
        }
        /**
         * Adds a new operation to the queue without waiting for it to complete (i.e.
         * we ignore the Promise result).
         */    enqueueAndForget(t) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.enqueue(t);
        }
        enqueueAndForgetEvenWhileRestricted(t) {
            this.Ta(), 
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.Ia(t);
        }
        enterRestrictedMode(t) {
            if (!this.wa) {
                this.wa = !0, this.ya = t || !1;
                const e = Hr();
                e && "function" == typeof e.removeEventListener && e.removeEventListener("visibilitychange", this.Ea);
            }
        }
        enqueue(t) {
            if (this.Ta(), this.wa) 
            // Return a Promise which never resolves.
            return new Promise((() => {}));
            // Create a deferred Promise that we can return to the callee. This
            // allows us to return a "hanging Promise" only to the callee and still
            // advance the queue even when the operation is not run.
                    const e = new j;
            return this.Ia((() => this.wa && this.ya ? Promise.resolve() : (t().then(e.resolve, e.reject), 
            e.promise))).then((() => e.promise));
        }
        enqueueRetryable(t) {
            this.enqueueAndForget((() => (this.da.push(t), this.Aa())));
        }
        /**
         * Runs the next operation from the retryable queue. If the operation fails,
         * reschedules with backoff.
         */    async Aa() {
            if (0 !== this.da.length) {
                try {
                    await this.da[0](), this.da.shift(), this.rr.reset();
                } catch (t) {
                    if (!zs(t)) throw t;
     // Failure will be handled by AsyncQueue
                                    k$1("AsyncQueue", "Operation failed with retryable error: " + t);
                }
                this.da.length > 0 && 
                // If there are additional operations, we re-schedule `retryNextOp()`.
                // This is necessary to run retryable operations that failed during
                // their initial attempt since we don't know whether they are already
                // enqueued. If, for example, `op1`, `op2`, `op3` are enqueued and `op1`
                // needs to  be re-run, we will run `op1`, `op1`, `op2` using the
                // already enqueued calls to `retryNextOp()`. `op3()` will then run in the
                // call scheduled here.
                // Since `backoffAndRun()` cancels an existing backoff and schedules a
                // new backoff on every call, there is only ever a single additional
                // operation in the queue.
                this.rr.Xi((() => this.Aa()));
            }
        }
        Ia(t) {
            const e = this.fa.then((() => (this.ga = !0, t().catch((t => {
                this.ma = t, this.ga = !1;
                // Re-throw the error so that this.tail becomes a rejected Promise and
                // all further attempts to chain (via .then) will just short-circuit
                // and return the rejected Promise.
                throw $("INTERNAL UNHANDLED ERROR: ", 
                /**
     * Chrome includes Error.message in Error.stack. Other browsers do not.
     * This returns expected output of message + stack when available.
     * @param error - Error or FirestoreError
     */
                function(t) {
                    let e = t.message || "";
                    t.stack && (e = t.stack.includes(t.message) ? t.stack : t.message + "\n" + t.stack);
                    return e;
                }
                /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ (t)), t;
            })).then((t => (this.ga = !1, t))))));
            return this.fa = e, e;
        }
        enqueueAfterDelay(t, e, n) {
            this.Ta(), 
            // Fast-forward delays for timerIds that have been overriden.
            this.pa.indexOf(t) > -1 && (e = 0);
            const s = No.createAndSchedule(this, t, e, n, (t => this.Ra(t)));
            return this._a.push(s), s;
        }
        Ta() {
            this.ma && M$1();
        }
        verifyOperationInProgress() {}
        /**
         * Waits until all currently queued tasks are finished executing. Delayed
         * operations are not run.
         */    async Pa() {
            // Operations in the queue prior to draining may have enqueued additional
            // operations. Keep draining the queue until the tail is no longer advanced,
            // which indicates that no more new operations were enqueued and that all
            // operations were executed.
            let t;
            do {
                t = this.fa, await t;
            } while (t !== this.fa);
        }
        /**
         * For Tests: Determine if a delayed operation with a particular TimerId
         * exists.
         */    ba(t) {
            for (const e of this._a) if (e.timerId === t) return !0;
            return !1;
        }
        /**
         * For Tests: Runs some or all delayed operations early.
         *
         * @param lastTimerId - Delayed operations up to and including this TimerId
         * will be drained. Pass TimerId.All to run all delayed operations.
         * @returns a Promise that resolves once all operations have been run.
         */    va(t) {
            // Note that draining may generate more delayed ops, so we do that first.
            return this.Pa().then((() => {
                // Run ops in the same order they'd run if they ran naturally.
                this._a.sort(((t, e) => t.targetTimeMs - e.targetTimeMs));
                for (const e of this._a) if (e.skipDelay(), "all" /* All */ !== t && e.timerId === t) break;
                return this.Pa();
            }));
        }
        /**
         * For Tests: Skip all subsequent delays for a timer id.
         */    Va(t) {
            this.pa.push(t);
        }
        /** Called once a DelayedOperation is run or canceled. */    Ra(t) {
            // NOTE: indexOf / slice are O(n), but delayedOperations is expected to be small.
            const e = this._a.indexOf(t);
            this._a.splice(e, 1);
        }
    }

    function Dc$1(t) {
        /**
     * Returns true if obj is an object and contains at least one of the specified
     * methods.
     */
        return function(t, e) {
            if ("object" != typeof t || null === t) return !1;
            const n = t;
            for (const t of e) if (t in n && "function" == typeof n[t]) return !0;
            return !1;
        }
        /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
        /**
     * Represents the task of loading a Firestore bundle. It provides progress of bundle
     * loading, as well as task completion and error events.
     *
     * The API is compatible with `Promise<LoadBundleTaskProgress>`.
     */ (t, [ "next", "error", "complete" ]);
    }

    /**
     * The Cloud Firestore service interface.
     *
     * Do not call this constructor directly. Instead, use {@link getFirestore}.
     */
    class xc$1 extends pc$1 {
        /** @hideconstructor */
        constructor(t, e) {
            super(t, e), 
            /**
             * Whether it's a {@link Firestore} or Firestore Lite instance.
             */
            this.type = "firestore", this._queue = new Sc$1, this._persistenceKey = "name" in t ? t.name : "[DEFAULT]";
        }
        _terminate() {
            return this._firestoreClient || 
            // The client must be initialized to ensure that all subsequent API
            // usage throws an exception.
            Fc$1(this), this._firestoreClient.terminate();
        }
    }

    /**
     * Returns the existing {@link Firestore} instance that is associated with the
     * provided {@link @firebase/app#FirebaseApp}. If no instance exists, initializes a new
     * instance with default settings.
     *
     * @param app - The {@link @firebase/app#FirebaseApp} instance that the returned {@link Firestore}
     * instance is associated with.
     * @returns The {@link Firestore} instance of the provided app.
     */ function $c$1(n = getApp()) {
        return _getProvider(n, "firestore").getImmediate();
    }

    /**
     * @internal
     */ function Oc$1(t) {
        return t._firestoreClient || Fc$1(t), t._firestoreClient.verifyNotTerminated(), t._firestoreClient;
    }

    function Fc$1(t) {
        var e;
        const n = t._freezeSettings(), s = function(t, e, n, s) {
            return new cc$1(t, e, n, s.host, s.ssl, s.experimentalForceLongPolling, s.experimentalAutoDetectLongPolling, s.useFetchStreams);
        }(t._databaseId, (null === (e = t._app) || void 0 === e ? void 0 : e.options.appId) || "", t._persistenceKey, n);
        t._firestoreClient = new qa$1(t._credentials, t._queue, s);
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A `FieldPath` refers to a field in a document. The path may consist of a
     * single field name (referring to a top-level field in the document), or a
     * list of field names (referring to a nested field in the document).
     *
     * Create a `FieldPath` by providing field names. If more than one field
     * name is provided, the path will point to a nested field in a document.
     */
    class Hc$1 {
        /**
         * Creates a `FieldPath` from the provided field names. If more than one field
         * name is provided, the path will point to a nested field in a document.
         *
         * @param fieldNames - A list of field names.
         */
        constructor(...t) {
            for (let e = 0; e < t.length; ++e) if (0 === t[e].length) throw new K$1(q$1.INVALID_ARGUMENT, "Invalid field name at argument $(i + 1). Field names must not be empty.");
            this._internalPath = new lt(t);
        }
        /**
         * Returns true if this `FieldPath` is equal to the provided one.
         *
         * @param other - The `FieldPath` to compare against.
         * @returns true if this `FieldPath` is equal to the provided one.
         */    isEqual(t) {
            return this._internalPath.isEqual(t._internalPath);
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * An immutable object representing an array of bytes.
     */ class Yc$1 {
        /** @hideconstructor */
        constructor(t) {
            this._byteString = t;
        }
        /**
         * Creates a new `Bytes` object from the given Base64 string, converting it to
         * bytes.
         *
         * @param base64 - The Base64 string used to create the `Bytes` object.
         */    static fromBase64String(t) {
            try {
                return new Yc$1(wt.fromBase64String(t));
            } catch (t) {
                throw new K$1(q$1.INVALID_ARGUMENT, "Failed to construct data from Base64 string: " + t);
            }
        }
        /**
         * Creates a new `Bytes` object from the given Uint8Array.
         *
         * @param array - The Uint8Array used to create the `Bytes` object.
         */    static fromUint8Array(t) {
            return new Yc$1(wt.fromUint8Array(t));
        }
        /**
         * Returns the underlying bytes as a Base64-encoded string.
         *
         * @returns The Base64-encoded string created from the `Bytes` object.
         */    toBase64() {
            return this._byteString.toBase64();
        }
        /**
         * Returns the underlying bytes in a new `Uint8Array`.
         *
         * @returns The Uint8Array created from the `Bytes` object.
         */    toUint8Array() {
            return this._byteString.toUint8Array();
        }
        /**
         * Returns a string representation of the `Bytes` object.
         *
         * @returns A string representation of the `Bytes` object.
         */    toString() {
            return "Bytes(base64: " + this.toBase64() + ")";
        }
        /**
         * Returns true if this `Bytes` object is equal to the provided one.
         *
         * @param other - The `Bytes` object to compare against.
         * @returns true if this `Bytes` object is equal to the provided one.
         */    isEqual(t) {
            return this._byteString.isEqual(t._byteString);
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Sentinel values that can be used when writing document fields with `set()`
     * or `update()`.
     */ class Xc$1 {
        /**
         * @param _methodName - The public API endpoint that returns this class.
         * @hideconstructor
         */
        constructor(t) {
            this._methodName = t;
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * An immutable object representing a geographic location in Firestore. The
     * location is represented as latitude/longitude pair.
     *
     * Latitude values are in the range of [-90, 90].
     * Longitude values are in the range of [-180, 180].
     */ class Zc$1 {
        /**
         * Creates a new immutable `GeoPoint` object with the provided latitude and
         * longitude values.
         * @param latitude - The latitude as number between -90 and 90.
         * @param longitude - The longitude as number between -180 and 180.
         */
        constructor(t, e) {
            if (!isFinite(t) || t < -90 || t > 90) throw new K$1(q$1.INVALID_ARGUMENT, "Latitude must be a number between -90 and 90, but was: " + t);
            if (!isFinite(e) || e < -180 || e > 180) throw new K$1(q$1.INVALID_ARGUMENT, "Longitude must be a number between -180 and 180, but was: " + e);
            this._lat = t, this._long = e;
        }
        /**
         * The latitude of this `GeoPoint` instance.
         */    get latitude() {
            return this._lat;
        }
        /**
         * The longitude of this `GeoPoint` instance.
         */    get longitude() {
            return this._long;
        }
        /**
         * Returns true if this `GeoPoint` is equal to the provided one.
         *
         * @param other - The `GeoPoint` to compare against.
         * @returns true if this `GeoPoint` is equal to the provided one.
         */    isEqual(t) {
            return this._lat === t._lat && this._long === t._long;
        }
        /** Returns a JSON-serializable representation of this GeoPoint. */    toJSON() {
            return {
                latitude: this._lat,
                longitude: this._long
            };
        }
        /**
         * Actually private to JS consumers of our API, so this function is prefixed
         * with an underscore.
         */    _compareTo(t) {
            return tt(this._lat, t._lat) || tt(this._long, t._long);
        }
    }

    /**
     * @license
     * Copyright 2017 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ const tu = /^__.*__$/;

    /** The result of parsing document data (e.g. for a setData call). */ class eu {
        constructor(t, e, n) {
            this.data = t, this.fieldMask = e, this.fieldTransforms = n;
        }
        toMutation(t, e) {
            return null !== this.fieldMask ? new en(t, this.data, this.fieldMask, e, this.fieldTransforms) : new tn(t, this.data, e, this.fieldTransforms);
        }
    }

    function su(t) {
        switch (t) {
          case 0 /* Set */ :
     // fall through
                  case 2 /* MergeSet */ :
     // fall through
                  case 1 /* Update */ :
            return !0;

          case 3 /* Argument */ :
          case 4 /* ArrayArgument */ :
            return !1;

          default:
            throw M$1();
        }
    }

    /** A "context" object passed around while parsing user data. */ class iu {
        /**
         * Initializes a ParseContext with the given source and path.
         *
         * @param settings - The settings for the parser.
         * @param databaseId - The database ID of the Firestore instance.
         * @param serializer - The serializer to use to generate the Value proto.
         * @param ignoreUndefinedProperties - Whether to ignore undefined properties
         * rather than throw.
         * @param fieldTransforms - A mutable list of field transforms encountered
         * while parsing the data.
         * @param fieldMask - A mutable list of field paths encountered while parsing
         * the data.
         *
         * TODO(b/34871131): We don't support array paths right now, so path can be
         * null to indicate the context represents any location within an array (in
         * which case certain features will not work and errors will be somewhat
         * compromised).
         */
        constructor(t, e, n, s, i, r) {
            this.settings = t, this.databaseId = e, this.N = n, this.ignoreUndefinedProperties = s, 
            // Minor hack: If fieldTransforms is undefined, we assume this is an
            // external call and we need to validate the entire path.
            void 0 === i && this.Sa(), this.fieldTransforms = i || [], this.fieldMask = r || [];
        }
        get path() {
            return this.settings.path;
        }
        get Da() {
            return this.settings.Da;
        }
        /** Returns a new context with the specified settings overwritten. */    Ca(t) {
            return new iu(Object.assign(Object.assign({}, this.settings), t), this.databaseId, this.N, this.ignoreUndefinedProperties, this.fieldTransforms, this.fieldMask);
        }
        Na(t) {
            var e;
            const n = null === (e = this.path) || void 0 === e ? void 0 : e.child(t), s = this.Ca({
                path: n,
                xa: !1
            });
            return s.ka(t), s;
        }
        $a(t) {
            var e;
            const n = null === (e = this.path) || void 0 === e ? void 0 : e.child(t), s = this.Ca({
                path: n,
                xa: !1
            });
            return s.Sa(), s;
        }
        Oa(t) {
            // TODO(b/34871131): We don't support array paths right now; so make path
            // undefined.
            return this.Ca({
                path: void 0,
                xa: !0
            });
        }
        Fa(t) {
            return Ru(t, this.settings.methodName, this.settings.Ma || !1, this.path, this.settings.La);
        }
        /** Returns 'true' if 'fieldPath' was traversed when creating this context. */    contains(t) {
            return void 0 !== this.fieldMask.find((e => t.isPrefixOf(e))) || void 0 !== this.fieldTransforms.find((e => t.isPrefixOf(e.field)));
        }
        Sa() {
            // TODO(b/34871131): Remove null check once we have proper paths for fields
            // within arrays.
            if (this.path) for (let t = 0; t < this.path.length; t++) this.ka(this.path.get(t));
        }
        ka(t) {
            if (0 === t.length) throw this.Fa("Document fields must not be empty");
            if (su(this.Da) && tu.test(t)) throw this.Fa('Document fields cannot begin and end with "__"');
        }
    }

    /**
     * Helper for parsing raw user input (provided via the API) into internal model
     * classes.
     */ class ru {
        constructor(t, e, n) {
            this.databaseId = t, this.ignoreUndefinedProperties = e, this.N = n || Jr(t);
        }
        /** Creates a new top-level parse context. */    Ba(t, e, n, s = !1) {
            return new iu({
                Da: t,
                methodName: e,
                La: n,
                path: lt.emptyPath(),
                xa: !1,
                Ma: s
            }, this.databaseId, this.N, this.ignoreUndefinedProperties);
        }
    }

    function ou(t) {
        const e = t._freezeSettings(), n = Jr(t._databaseId);
        return new ru(t._databaseId, !!e.ignoreUndefinedProperties, n);
    }

    /** Parse document data from a set() call. */ function au(t, e, n, s, i, r = {}) {
        const o = t.Ba(r.merge || r.mergeFields ? 2 /* MergeSet */ : 0 /* Set */ , e, n, i);
        Eu("Data must be an object, but it was:", o, s);
        const a = yu(s, o);
        let c, u;
        if (r.merge) c = new ft(o.fieldMask), u = o.fieldTransforms; else if (r.mergeFields) {
            const t = [];
            for (const s of r.mergeFields) {
                const i = Tu(e, s, n);
                if (!o.contains(i)) throw new K$1(q$1.INVALID_ARGUMENT, `Field '${i}' is specified in your field mask but missing from your input data.`);
                Pu(t, i) || t.push(i);
            }
            c = new ft(t), u = o.fieldTransforms.filter((t => c.covers(t.field)));
        } else c = null, u = o.fieldTransforms;
        return new eu(new Bt(a), c, u);
    }

    /**
     * Parse a "query value" (e.g. value in a where filter or a value in a cursor
     * bound).
     *
     * @param allowArrays - Whether the query value is an array that may directly
     * contain additional arrays (e.g. the operand of an `in` query).
     */ function mu(t, e, n, s = !1) {
        return gu(n, t.Ba(s ? 4 /* ArrayArgument */ : 3 /* Argument */ , e));
    }

    /**
     * Parses user data to Protobuf Values.
     *
     * @param input - Data to be parsed.
     * @param context - A context object representing the current path being parsed,
     * the source of the data being parsed, etc.
     * @returns The parsed value, or null if the value was a FieldValue sentinel
     * that should not be included in the resulting parsed data.
     */ function gu(t, e) {
        if (pu(
        // Unwrap the API type from the Compat SDK. This will return the API type
        // from firestore-exp.
        t = getModularInstance(t))) return Eu("Unsupported field value:", e, t), yu(t, e);
        if (t instanceof Xc$1) 
        // FieldValues usually parse into transforms (except FieldValue.delete())
        // in which case we do not want to include this field in our parsed data
        // (as doing so will overwrite the field directly prior to the transform
        // trying to transform it). So we don't add this location to
        // context.fieldMask and we return null as our parsing result.
        /**
     * "Parses" the provided FieldValueImpl, adding any necessary transforms to
     * context.fieldTransforms.
     */
        return function(t, e) {
            // Sentinels are only supported with writes, and not within arrays.
            if (!su(e.Da)) throw e.Fa(`${t._methodName}() can only be used with update() and set()`);
            if (!e.path) throw e.Fa(`${t._methodName}() is not currently supported inside arrays`);
            const n = t._toFieldTransform(e);
            n && e.fieldTransforms.push(n);
        }
        /**
     * Helper to parse a scalar value (i.e. not an Object, Array, or FieldValue)
     *
     * @returns The parsed value
     */ (t, e), null;
        if (void 0 === t && e.ignoreUndefinedProperties) 
        // If the input is undefined it can never participate in the fieldMask, so
        // don't handle this below. If `ignoreUndefinedProperties` is false,
        // `parseScalarValue` will reject an undefined value.
        return null;
        if (
        // If context.path is null we are inside an array and we don't support
        // field mask paths more granular than the top-level array.
        e.path && e.fieldMask.push(e.path), t instanceof Array) {
            // TODO(b/34871131): Include the path containing the array in the error
            // message.
            // In the case of IN queries, the parsed data is an array (representing
            // the set of values to be included for the IN query) that may directly
            // contain additional arrays (each representing an individual field
            // value), so we disable this validation.
            if (e.settings.xa && 4 /* ArrayArgument */ !== e.Da) throw e.Fa("Nested arrays are not supported");
            return function(t, e) {
                const n = [];
                let s = 0;
                for (const i of t) {
                    let t = gu(i, e.Oa(s));
                    null == t && (
                    // Just include nulls in the array for fields being replaced with a
                    // sentinel.
                    t = {
                        nullValue: "NULL_VALUE"
                    }), n.push(t), s++;
                }
                return {
                    arrayValue: {
                        values: n
                    }
                };
            }(t, e);
        }
        return function(t, e) {
            if (null === (t = getModularInstance(t))) return {
                nullValue: "NULL_VALUE"
            };
            if ("number" == typeof t) return De(e.N, t);
            if ("boolean" == typeof t) return {
                booleanValue: t
            };
            if ("string" == typeof t) return {
                stringValue: t
            };
            if (t instanceof Date) {
                const n = st.fromDate(t);
                return {
                    timestampValue: Bn(e.N, n)
                };
            }
            if (t instanceof st) {
                // Firestore backend truncates precision down to microseconds. To ensure
                // offline mode works the same with regards to truncation, perform the
                // truncation immediately without waiting for the backend to do that.
                const n = new st(t.seconds, 1e3 * Math.floor(t.nanoseconds / 1e3));
                return {
                    timestampValue: Bn(e.N, n)
                };
            }
            if (t instanceof Zc$1) return {
                geoPointValue: {
                    latitude: t.latitude,
                    longitude: t.longitude
                }
            };
            if (t instanceof Yc$1) return {
                bytesValue: Un(e.N, t._byteString)
            };
            if (t instanceof Tc$1) {
                const n = e.databaseId, s = t.firestore._databaseId;
                if (!s.isEqual(n)) throw e.Fa(`Document reference is for database ${s.projectId}/${s.database} but should be for database ${n.projectId}/${n.database}`);
                return {
                    referenceValue: jn(t.firestore._databaseId || e.databaseId, t._key.path)
                };
            }
            throw e.Fa(`Unsupported field value: ${_c(t)}`);
        }
        /**
     * Checks whether an object looks like a JSON object that should be converted
     * into a struct. Normal class/prototype instances are considered to look like
     * JSON objects since they should be converted to a struct value. Arrays, Dates,
     * GeoPoints, etc. are not considered to look like JSON objects since they map
     * to specific FieldValue types other than ObjectValue.
     */ (t, e);
    }

    function yu(t, e) {
        const n = {};
        return at(t) ? 
        // If we encounter an empty object, we explicitly add it to the update
        // mask to ensure that the server creates a map entry.
        e.path && e.path.length > 0 && e.fieldMask.push(e.path) : ot(t, ((t, s) => {
            const i = gu(s, e.Na(t));
            null != i && (n[t] = i);
        })), {
            mapValue: {
                fields: n
            }
        };
    }

    function pu(t) {
        return !("object" != typeof t || null === t || t instanceof Array || t instanceof Date || t instanceof st || t instanceof Zc$1 || t instanceof Yc$1 || t instanceof Tc$1 || t instanceof Xc$1);
    }

    function Eu(t, e, n) {
        if (!pu(n) || !function(t) {
            return "object" == typeof t && null !== t && (Object.getPrototypeOf(t) === Object.prototype || null === Object.getPrototypeOf(t));
        }(n)) {
            const s = _c(n);
            throw "an object" === s ? e.Fa(t + " a custom object") : e.Fa(t + " " + s);
        }
    }

    /**
     * Helper that calls fromDotSeparatedString() but wraps any error thrown.
     */ function Tu(t, e, n) {
        if ((
        // If required, replace the FieldPath Compat class with with the firestore-exp
        // FieldPath.
        e = getModularInstance(e)) instanceof Hc$1) return e._internalPath;
        if ("string" == typeof e) return Au(t, e);
        throw Ru("Field path arguments must be of type string or FieldPath.", t, 
        /* hasConverter= */ !1, 
        /* path= */ void 0, n);
    }

    /**
     * Matches any characters in a field path string that are reserved.
     */ const Iu = new RegExp("[~\\*/\\[\\]]");

    /**
     * Wraps fromDotSeparatedString with an error message about the method that
     * was thrown.
     * @param methodName - The publicly visible method name
     * @param path - The dot-separated string form of a field path which will be
     * split on dots.
     * @param targetDoc - The document against which the field path will be
     * evaluated.
     */ function Au(t, e, n) {
        if (e.search(Iu) >= 0) throw Ru(`Invalid field path (${e}). Paths must not contain '~', '*', '/', '[', or ']'`, t, 
        /* hasConverter= */ !1, 
        /* path= */ void 0, n);
        try {
            return new Hc$1(...e.split("."))._internalPath;
        } catch (s) {
            throw Ru(`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`, t, 
            /* hasConverter= */ !1, 
            /* path= */ void 0, n);
        }
    }

    function Ru(t, e, n, s, i) {
        const r = s && !s.isEmpty(), o = void 0 !== i;
        let a = `Function ${e}() called with invalid data`;
        n && (a += " (via `toFirestore()`)"), a += ". ";
        let c = "";
        return (r || o) && (c += " (found", r && (c += ` in field ${s}`), o && (c += ` in document ${i}`), 
        c += ")"), new K$1(q$1.INVALID_ARGUMENT, a + t + c);
    }

    /** Checks `haystack` if FieldPath `needle` is present. Runs in O(n). */ function Pu(t, e) {
        return t.some((t => t.isEqual(e)));
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * A `DocumentSnapshot` contains data read from a document in your Firestore
     * database. The data can be extracted with `.data()` or `.get(<field>)` to
     * get a specific field.
     *
     * For a `DocumentSnapshot` that points to a non-existing document, any data
     * access will return 'undefined'. You can use the `exists()` method to
     * explicitly verify a document's existence.
     */ class bu {
        // Note: This class is stripped down version of the DocumentSnapshot in
        // the legacy SDK. The changes are:
        // - No support for SnapshotMetadata.
        // - No support for SnapshotOptions.
        /** @hideconstructor protected */
        constructor(t, e, n, s, i) {
            this._firestore = t, this._userDataWriter = e, this._key = n, this._document = s, 
            this._converter = i;
        }
        /** Property of the `DocumentSnapshot` that provides the document's ID. */    get id() {
            return this._key.path.lastSegment();
        }
        /**
         * The `DocumentReference` for the document included in the `DocumentSnapshot`.
         */    get ref() {
            return new Tc$1(this._firestore, this._converter, this._key);
        }
        /**
         * Signals whether or not the document at the snapshot's location exists.
         *
         * @returns true if the document exists.
         */    exists() {
            return null !== this._document;
        }
        /**
         * Retrieves all fields in the document as an `Object`. Returns `undefined` if
         * the document doesn't exist.
         *
         * @returns An `Object` containing all fields in the document or `undefined`
         * if the document doesn't exist.
         */    data() {
            if (this._document) {
                if (this._converter) {
                    // We only want to use the converter and create a new DocumentSnapshot
                    // if a converter has been provided.
                    const t = new vu(this._firestore, this._userDataWriter, this._key, this._document, 
                    /* converter= */ null);
                    return this._converter.fromFirestore(t);
                }
                return this._userDataWriter.convertValue(this._document.data.value);
            }
        }
        /**
         * Retrieves the field specified by `fieldPath`. Returns `undefined` if the
         * document or field doesn't exist.
         *
         * @param fieldPath - The path (for example 'foo' or 'foo.bar') to a specific
         * field.
         * @returns The data at the specified field location or undefined if no such
         * field exists in the document.
         */
        // We are using `any` here to avoid an explicit cast by our users.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get(t) {
            if (this._document) {
                const e = this._document.data.field(Vu("DocumentSnapshot.get", t));
                if (null !== e) return this._userDataWriter.convertValue(e);
            }
        }
    }

    /**
     * A `QueryDocumentSnapshot` contains data read from a document in your
     * Firestore database as part of a query. The document is guaranteed to exist
     * and its data can be extracted with `.data()` or `.get(<field>)` to get a
     * specific field.
     *
     * A `QueryDocumentSnapshot` offers the same API surface as a
     * `DocumentSnapshot`. Since query results contain only existing documents, the
     * `exists` property will always be true and `data()` will never return
     * 'undefined'.
     */ class vu extends bu {
        /**
         * Retrieves all fields in the document as an `Object`.
         *
         * @override
         * @returns An `Object` containing all fields in the document.
         */
        data() {
            return super.data();
        }
    }

    /**
     * Helper that calls `fromDotSeparatedString()` but wraps any error thrown.
     */ function Vu(t, e) {
        return "string" == typeof e ? Au(t, e) : e instanceof Hc$1 ? e._internalPath : e._delegate._internalPath;
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Metadata about a snapshot, describing the state of the snapshot.
     */ class Su {
        /** @hideconstructor */
        constructor(t, e) {
            this.hasPendingWrites = t, this.fromCache = e;
        }
        /**
         * Returns true if this `SnapshotMetadata` is equal to the provided one.
         *
         * @param other - The `SnapshotMetadata` to compare against.
         * @returns true if this `SnapshotMetadata` is equal to the provided one.
         */    isEqual(t) {
            return this.hasPendingWrites === t.hasPendingWrites && this.fromCache === t.fromCache;
        }
    }

    /**
     * A `DocumentSnapshot` contains data read from a document in your Firestore
     * database. The data can be extracted with `.data()` or `.get(<field>)` to
     * get a specific field.
     *
     * For a `DocumentSnapshot` that points to a non-existing document, any data
     * access will return 'undefined'. You can use the `exists()` method to
     * explicitly verify a document's existence.
     */ class Du extends bu {
        /** @hideconstructor protected */
        constructor(t, e, n, s, i, r) {
            super(t, e, n, s, r), this._firestore = t, this._firestoreImpl = t, this.metadata = i;
        }
        /**
         * Property of the `DocumentSnapshot` that signals whether or not the data
         * exists. True if the document exists.
         */    exists() {
            return super.exists();
        }
        /**
         * Retrieves all fields in the document as an `Object`. Returns `undefined` if
         * the document doesn't exist.
         *
         * By default, `FieldValue.serverTimestamp()` values that have not yet been
         * set to their final value will be returned as `null`. You can override
         * this by passing an options object.
         *
         * @param options - An options object to configure how data is retrieved from
         * the snapshot (for example the desired behavior for server timestamps that
         * have not yet been set to their final value).
         * @returns An `Object` containing all fields in the document or `undefined` if
         * the document doesn't exist.
         */    data(t = {}) {
            if (this._document) {
                if (this._converter) {
                    // We only want to use the converter and create a new DocumentSnapshot
                    // if a converter has been provided.
                    const e = new Cu(this._firestore, this._userDataWriter, this._key, this._document, this.metadata, 
                    /* converter= */ null);
                    return this._converter.fromFirestore(e, t);
                }
                return this._userDataWriter.convertValue(this._document.data.value, t.serverTimestamps);
            }
        }
        /**
         * Retrieves the field specified by `fieldPath`. Returns `undefined` if the
         * document or field doesn't exist.
         *
         * By default, a `FieldValue.serverTimestamp()` that has not yet been set to
         * its final value will be returned as `null`. You can override this by
         * passing an options object.
         *
         * @param fieldPath - The path (for example 'foo' or 'foo.bar') to a specific
         * field.
         * @param options - An options object to configure how the field is retrieved
         * from the snapshot (for example the desired behavior for server timestamps
         * that have not yet been set to their final value).
         * @returns The data at the specified field location or undefined if no such
         * field exists in the document.
         */
        // We are using `any` here to avoid an explicit cast by our users.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get(t, e = {}) {
            if (this._document) {
                const n = this._document.data.field(Vu("DocumentSnapshot.get", t));
                if (null !== n) return this._userDataWriter.convertValue(n, e.serverTimestamps);
            }
        }
    }

    /**
     * A `QueryDocumentSnapshot` contains data read from a document in your
     * Firestore database as part of a query. The document is guaranteed to exist
     * and its data can be extracted with `.data()` or `.get(<field>)` to get a
     * specific field.
     *
     * A `QueryDocumentSnapshot` offers the same API surface as a
     * `DocumentSnapshot`. Since query results contain only existing documents, the
     * `exists` property will always be true and `data()` will never return
     * 'undefined'.
     */ class Cu extends Du {
        /**
         * Retrieves all fields in the document as an `Object`.
         *
         * By default, `FieldValue.serverTimestamp()` values that have not yet been
         * set to their final value will be returned as `null`. You can override
         * this by passing an options object.
         *
         * @override
         * @param options - An options object to configure how data is retrieved from
         * the snapshot (for example the desired behavior for server timestamps that
         * have not yet been set to their final value).
         * @returns An `Object` containing all fields in the document.
         */
        data(t = {}) {
            return super.data(t);
        }
    }

    /**
     * A `QuerySnapshot` contains zero or more `DocumentSnapshot` objects
     * representing the results of a query. The documents can be accessed as an
     * array via the `docs` property or enumerated using the `forEach` method. The
     * number of documents can be determined via the `empty` and `size`
     * properties.
     */ class Nu {
        /** @hideconstructor */
        constructor(t, e, n, s) {
            this._firestore = t, this._userDataWriter = e, this._snapshot = s, this.metadata = new Su(s.hasPendingWrites, s.fromCache), 
            this.query = n;
        }
        /** An array of all the documents in the `QuerySnapshot`. */    get docs() {
            const t = [];
            return this.forEach((e => t.push(e))), t;
        }
        /** The number of documents in the `QuerySnapshot`. */    get size() {
            return this._snapshot.docs.size;
        }
        /** True if there are no documents in the `QuerySnapshot`. */    get empty() {
            return 0 === this.size;
        }
        /**
         * Enumerates all of the documents in the `QuerySnapshot`.
         *
         * @param callback - A callback to be called with a `QueryDocumentSnapshot` for
         * each document in the snapshot.
         * @param thisArg - The `this` binding for the callback.
         */    forEach(t, e) {
            this._snapshot.docs.forEach((n => {
                t.call(e, new Cu(this._firestore, this._userDataWriter, n.key, n, new Su(this._snapshot.mutatedKeys.has(n.key), this._snapshot.fromCache), this.query.converter));
            }));
        }
        /**
         * Returns an array of the documents changes since the last snapshot. If this
         * is the first snapshot, all documents will be in the list as 'added'
         * changes.
         *
         * @param options - `SnapshotListenOptions` that control whether metadata-only
         * changes (i.e. only `DocumentSnapshot.metadata` changed) should trigger
         * snapshot events.
         */    docChanges(t = {}) {
            const e = !!t.includeMetadataChanges;
            if (e && this._snapshot.excludesMetadataChanges) throw new K$1(q$1.INVALID_ARGUMENT, "To include metadata changes with your document changes, you must also pass { includeMetadataChanges:true } to onSnapshot().");
            return this._cachedChanges && this._cachedChangesIncludeMetadataChanges === e || (this._cachedChanges = 
            /** Calculates the array of `DocumentChange`s for a given `ViewSnapshot`. */
            function(t, e) {
                if (t._snapshot.oldDocs.isEmpty()) {
                    let e = 0;
                    return t._snapshot.docChanges.map((n => ({
                        type: "added",
                        doc: new Cu(t._firestore, t._userDataWriter, n.doc.key, n.doc, new Su(t._snapshot.mutatedKeys.has(n.doc.key), t._snapshot.fromCache), t.query.converter),
                        oldIndex: -1,
                        newIndex: e++
                    })));
                }
                {
                    // A `DocumentSet` that is updated incrementally as changes are applied to use
                    // to lookup the index of a document.
                    let n = t._snapshot.oldDocs;
                    return t._snapshot.docChanges.filter((t => e || 3 /* Metadata */ !== t.type)).map((e => {
                        const s = new Cu(t._firestore, t._userDataWriter, e.doc.key, e.doc, new Su(t._snapshot.mutatedKeys.has(e.doc.key), t._snapshot.fromCache), t.query.converter);
                        let i = -1, r = -1;
                        return 0 /* Added */ !== e.type && (i = n.indexOf(e.doc.key), n = n.delete(e.doc.key)), 
                        1 /* Removed */ !== e.type && (n = n.add(e.doc), r = n.indexOf(e.doc.key)), {
                            type: xu(e.type),
                            doc: s,
                            oldIndex: i,
                            newIndex: r
                        };
                    }));
                }
            }(this, e), this._cachedChangesIncludeMetadataChanges = e), this._cachedChanges;
        }
    }

    function xu(t) {
        switch (t) {
          case 0 /* Added */ :
            return "added";

          case 2 /* Modified */ :
          case 3 /* Metadata */ :
            return "modified";

          case 1 /* Removed */ :
            return "removed";

          default:
            return M$1();
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */ function $u(t) {
        if (_e(t) && 0 === t.explicitOrderBy.length) throw new K$1(q$1.UNIMPLEMENTED, "limitToLast() queries require specifying at least one orderBy() clause");
    }

    /**
     * A `QueryConstraint` is used to narrow the set of documents returned by a
     * Firestore query. `QueryConstraint`s are created by invoking {@link where},
     * {@link orderBy}, {@link (startAt:1)}, {@link (startAfter:1)}, {@link
     * endBefore:1}, {@link (endAt:1)}, {@link limit} or {@link limitToLast} and
     * can then be passed to {@link query} to create a new query instance that
     * also contains this `QueryConstraint`.
     */ class Ou {}

    /**
     * Creates a new immutable instance of {@link Query} that is extended to also include
     * additional query constraints.
     *
     * @param query - The {@link Query} instance to use as a base for the new constraints.
     * @param queryConstraints - The list of {@link QueryConstraint}s to apply.
     * @throws if any of the provided query constraints cannot be combined with the
     * existing or new constraints.
     */ function Fu(t, ...e) {
        for (const n of e) t = n._apply(t);
        return t;
    }

    class Mu extends Ou {
        constructor(t, e, n) {
            super(), this.Ka = t, this.ja = e, this.Qa = n, this.type = "where";
        }
        _apply(t) {
            const e = ou(t.firestore), n = function(t, e, n, s, i, r, o) {
                let a;
                if (i.isKeyField()) {
                    if ("array-contains" /* ARRAY_CONTAINS */ === r || "array-contains-any" /* ARRAY_CONTAINS_ANY */ === r) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid Query. You can't perform '${r}' queries on FieldPath.documentId().`);
                    if ("in" /* IN */ === r || "not-in" /* NOT_IN */ === r) {
                        Zu(o, r);
                        const e = [];
                        for (const n of o) e.push(Xu(s, t, n));
                        a = {
                            arrayValue: {
                                values: e
                            }
                        };
                    } else a = Xu(s, t, o);
                } else "in" /* IN */ !== r && "not-in" /* NOT_IN */ !== r && "array-contains-any" /* ARRAY_CONTAINS_ANY */ !== r || Zu(o, r), 
                a = mu(n, e, o, 
                /* allowArrays= */ "in" /* IN */ === r || "not-in" /* NOT_IN */ === r);
                const c = Ht.create(i, r, a);
                return function(t, e) {
                    if (e.v()) {
                        const n = ge(t);
                        if (null !== n && !n.isEqual(e.field)) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid query. All where filters with an inequality (<, <=, !=, not-in, >, or >=) must be on the same field. But you have inequality filters on '${n.toString()}' and '${e.field.toString()}'`);
                        const s = me(t);
                        null !== s && th(t, e.field, s);
                    }
                    const n = function(t, e) {
                        for (const n of t.filters) if (e.indexOf(n.op) >= 0) return n.op;
                        return null;
                    }(t, 
                    /**
     * Given an operator, returns the set of operators that cannot be used with it.
     *
     * Operators in a query must adhere to the following set of rules:
     * 1. Only one array operator is allowed.
     * 2. Only one disjunctive operator is allowed.
     * 3. `NOT_EQUAL` cannot be used with another `NOT_EQUAL` operator.
     * 4. `NOT_IN` cannot be used with array, disjunctive, or `NOT_EQUAL` operators.
     *
     * Array operators: `ARRAY_CONTAINS`, `ARRAY_CONTAINS_ANY`
     * Disjunctive operators: `IN`, `ARRAY_CONTAINS_ANY`, `NOT_IN`
     */
                    function(t) {
                        switch (t) {
                          case "!=" /* NOT_EQUAL */ :
                            return [ "!=" /* NOT_EQUAL */ , "not-in" /* NOT_IN */ ];

                          case "array-contains" /* ARRAY_CONTAINS */ :
                            return [ "array-contains" /* ARRAY_CONTAINS */ , "array-contains-any" /* ARRAY_CONTAINS_ANY */ , "not-in" /* NOT_IN */ ];

                          case "in" /* IN */ :
                            return [ "array-contains-any" /* ARRAY_CONTAINS_ANY */ , "in" /* IN */ , "not-in" /* NOT_IN */ ];

                          case "array-contains-any" /* ARRAY_CONTAINS_ANY */ :
                            return [ "array-contains" /* ARRAY_CONTAINS */ , "array-contains-any" /* ARRAY_CONTAINS_ANY */ , "in" /* IN */ , "not-in" /* NOT_IN */ ];

                          case "not-in" /* NOT_IN */ :
                            return [ "array-contains" /* ARRAY_CONTAINS */ , "array-contains-any" /* ARRAY_CONTAINS_ANY */ , "in" /* IN */ , "not-in" /* NOT_IN */ , "!=" /* NOT_EQUAL */ ];

                          default:
                            return [];
                        }
                    }(e.op));
                    if (null !== n) 
                    // Special case when it's a duplicate op to give a slightly clearer error message.
                    throw n === e.op ? new K$1(q$1.INVALID_ARGUMENT, `Invalid query. You cannot use more than one '${e.op.toString()}' filter.`) : new K$1(q$1.INVALID_ARGUMENT, `Invalid query. You cannot use '${e.op.toString()}' filters with '${n.toString()}' filters.`);
                }(t, c), c;
            }(t._query, "where", e, t.firestore._databaseId, this.Ka, this.ja, this.Qa);
            return new Ic$1(t.firestore, t.converter, function(t, e) {
                const n = t.filters.concat([ e ]);
                return new le(t.path, t.collectionGroup, t.explicitOrderBy.slice(), n, t.limit, t.limitType, t.startAt, t.endAt);
            }(t._query, n));
        }
    }

    /**
     * Creates a {@link QueryConstraint} that enforces that documents must contain the
     * specified field and that the value should satisfy the relation constraint
     * provided.
     *
     * @param fieldPath - The path to compare
     * @param opStr - The operation string (e.g "&lt;", "&lt;=", "==", "&lt;",
     *   "&lt;=", "!=").
     * @param value - The value for comparison
     * @returns The created {@link Query}.
     */ function Lu(t, e, n) {
        const s = e, i = Vu("where", t);
        return new Mu(i, s, n);
    }

    function Xu(t, e, n) {
        if ("string" == typeof (n = getModularInstance(n))) {
            if ("" === n) throw new K$1(q$1.INVALID_ARGUMENT, "Invalid query. When querying with FieldPath.documentId(), you must provide a valid document ID, but it was an empty string.");
            if (!ye(e) && -1 !== n.indexOf("/")) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid query. When querying a collection by FieldPath.documentId(), you must provide a plain document ID, but '${n}' contains a '/' character.`);
            const s = e.path.child(ut.fromString(n));
            if (!Pt.isDocumentKey(s)) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid query. When querying a collection group by FieldPath.documentId(), the value provided must result in a valid document path, but '${s}' is not because it has an odd number of segments (${s.length}).`);
            return xt(t, new Pt(s));
        }
        if (n instanceof Tc$1) return xt(t, n._key);
        throw new K$1(q$1.INVALID_ARGUMENT, `Invalid query. When querying with FieldPath.documentId(), you must provide a valid string or a DocumentReference, but it was: ${_c(n)}.`);
    }

    /**
     * Validates that the value passed into a disjunctive filter satisfies all
     * array requirements.
     */ function Zu(t, e) {
        if (!Array.isArray(t) || 0 === t.length) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid Query. A non-empty array is required for '${e.toString()}' filters.`);
        if (t.length > 10) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid Query. '${e.toString()}' filters support a maximum of 10 elements in the value array.`);
    }

    function th(t, e, n) {
        if (!n.isEqual(e)) throw new K$1(q$1.INVALID_ARGUMENT, `Invalid query. You have a where filter with an inequality (<, <=, !=, not-in, >, or >=) on field '${e.toString()}' and so you must also use '${e.toString()}' as your first argument to orderBy(), but your first orderBy() is on field '${n.toString()}' instead.`);
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Converts Firestore's internal types to the JavaScript types that we expose
     * to the user.
     *
     * @internal
     */ class eh {
        convertValue(t, e = "none") {
            switch (bt(t)) {
              case 0 /* NullValue */ :
                return null;

              case 1 /* BooleanValue */ :
                return t.booleanValue;

              case 2 /* NumberValue */ :
                return gt(t.integerValue || t.doubleValue);

              case 3 /* TimestampValue */ :
                return this.convertTimestamp(t.timestampValue);

              case 4 /* ServerTimestampValue */ :
                return this.convertServerTimestamp(t, e);

              case 5 /* StringValue */ :
                return t.stringValue;

              case 6 /* BlobValue */ :
                return this.convertBytes(yt(t.bytesValue));

              case 7 /* RefValue */ :
                return this.convertReference(t.referenceValue);

              case 8 /* GeoPointValue */ :
                return this.convertGeoPoint(t.geoPointValue);

              case 9 /* ArrayValue */ :
                return this.convertArray(t.arrayValue, e);

              case 10 /* ObjectValue */ :
                return this.convertObject(t.mapValue, e);

              default:
                throw M$1();
            }
        }
        convertObject(t, e) {
            const n = {};
            return ot(t.fields, ((t, s) => {
                n[t] = this.convertValue(s, e);
            })), n;
        }
        convertGeoPoint(t) {
            return new Zc$1(gt(t.latitude), gt(t.longitude));
        }
        convertArray(t, e) {
            return (t.values || []).map((t => this.convertValue(t, e)));
        }
        convertServerTimestamp(t, e) {
            switch (e) {
              case "previous":
                const n = Et(t);
                return null == n ? null : this.convertValue(n, e);

              case "estimate":
                return this.convertTimestamp(Tt(t));

              default:
                return null;
            }
        }
        convertTimestamp(t) {
            const e = mt(t);
            return new st(e.seconds, e.nanos);
        }
        convertDocumentKey(t, e) {
            const n = ut.fromString(t);
            L$1(ps(n));
            const s = new uc$1(n.get(1), n.get(3)), i = new Pt(n.popFirst(5));
            return s.isEqual(e) || 
            // TODO(b/64130202): Somehow support foreign references.
            $(`Document ${i} contains a document reference within a different database (${s.projectId}/${s.database}) which is not supported. It will be treated as a reference in the current database (${e.projectId}/${e.database}) instead.`), 
            i;
        }
    }

    /**
     * @license
     * Copyright 2020 Google LLC
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *   http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */
    /**
     * Converts custom model object of type T into `DocumentData` by applying the
     * converter if it exists.
     *
     * This function is used when converting user objects to `DocumentData`
     * because we want to provide the user with a more specific error message if
     * their `set()` or fails due to invalid data originating from a `toFirestore()`
     * call.
     */ function nh(t, e, n) {
        let s;
        // Cast to `any` in order to satisfy the union type constraint on
        // toFirestore().
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return s = t ? n && (n.merge || n.mergeFields) ? t.toFirestore(e, n) : t.toFirestore(e) : e, 
        s;
    }

    class ah extends eh {
        constructor(t) {
            super(), this.firestore = t;
        }
        convertBytes(t) {
            return new Yc$1(t);
        }
        convertReference(t) {
            const e = this.convertDocumentKey(t, this.firestore._databaseId);
            return new Tc$1(this.firestore, /* converter= */ null, e);
        }
    }

    /**
     * Executes the query and returns the results as a `QuerySnapshot`.
     *
     * Note: `getDocs()` attempts to provide up-to-date data when possible by
     * waiting for data from the server, but it may return cached data or fail if
     * you are offline and the server cannot be reached. To specify this behavior,
     * invoke {@link getDocsFromCache} or {@link getDocsFromServer}.
     *
     * @returns A `Promise` that will be resolved with the results of the query.
     */ function hh(t) {
        t = mc$1(t, Ic$1);
        const e = mc$1(t.firestore, xc$1), n = Oc$1(e), s = new ah(e);
        return $u(t._query), sc$1(n, t._query).then((n => new Nu(e, s, t, n)));
    }

    function dh(t, e, n) {
        t = mc$1(t, Tc$1);
        const s = mc$1(t.firestore, xc$1), i = nh(t.converter, e, n);
        return ph(s, [ au(ou(s), "setDoc", t._key, i, null !== t.converter, n).toMutation(t._key, We.none()) ]);
    }

    function gh(t, ...e) {
        var n, s, i;
        t = getModularInstance(t);
        let r = {
            includeMetadataChanges: !1
        }, o = 0;
        "object" != typeof e[o] || Dc$1(e[o]) || (r = e[o], o++);
        const a = {
            includeMetadataChanges: r.includeMetadataChanges
        };
        if (Dc$1(e[o])) {
            const t = e[o];
            e[o] = null === (n = t.next) || void 0 === n ? void 0 : n.bind(t), e[o + 1] = null === (s = t.error) || void 0 === s ? void 0 : s.bind(t), 
            e[o + 2] = null === (i = t.complete) || void 0 === i ? void 0 : i.bind(t);
        }
        let c, u, h;
        if (t instanceof Tc$1) u = mc$1(t.firestore, xc$1), h = de(t._key.path), c = {
            next: n => {
                e[o] && e[o](Eh(u, t, n));
            },
            error: e[o + 1],
            complete: e[o + 2]
        }; else {
            const n = mc$1(t, Ic$1);
            u = mc$1(n.firestore, xc$1), h = n._query;
            const s = new ah(u);
            c = {
                next: t => {
                    e[o] && e[o](new Nu(u, s, n, t));
                },
                error: e[o + 1],
                complete: e[o + 2]
            }, $u(t._query);
        }
        return function(t, e, n, s) {
            const i = new Ma$1(s), r = new jo(e, i, n);
            return t.asyncQueue.enqueueAndForget((async () => Lo(await Ya$1(t), r))), () => {
                i.Xo(), t.asyncQueue.enqueueAndForget((async () => Bo(await Ya$1(t), r)));
            };
        }(Oc$1(u), h, a, c);
    }

    /**
     * Locally writes `mutations` on the async queue.
     * @internal
     */ function ph(t, e) {
        return function(t, e) {
            const n = new j;
            return t.asyncQueue.enqueueAndForget((async () => ia$1(await Ja$1(t), e, n))), n.promise;
        }(Oc$1(t), e);
    }

    /**
     * Converts a {@link ViewSnapshot} that contains the single document specified by `ref`
     * to a {@link DocumentSnapshot}.
     */ function Eh(t, e, n) {
        const s = n.docs.get(e._key), i = new ah(t);
        return new Du(t, i, e._key, s, new Su(n.hasPendingWrites, n.fromCache), e.converter);
    }

    /**
     * Cloud Firestore
     *
     * @packageDocumentation
     */ var Sh;

    !function(t) {
        D$1 = t;
    }(SDK_VERSION), _registerComponent(new Component("firestore", ((t, {options: e}) => {
        const n = t.getProvider("app").getImmediate(), s = new xc$1(n, new z$1(t.getProvider("auth-internal")));
        return e = Object.assign({
            useFetchStreams: !0
        }, e), s._setSettings(e), s;
    }), "PUBLIC" /* PUBLIC */)), registerVersion("@firebase/firestore", "3.0.1", Sh);

    // src/services/firebase.ts

    const config = {
      apiKey: "AIzaSyDkrVV8Upr_UyjxhxHpf7ouVScZpoZPsTY",
      authDomain: "grequel-controller.firebaseapp.com",
      projectId: "grequel-controller",
      storageBucket: "grequel-controller.appspot.com",
      messagingSenderId: "24794021032",
      appId: "1:24794021032:web:0b7b932ad95546243ad69d",
      measurementId: "G-XFQBBZNEEM"
    };

    const app = initializeApp(config);

    // Auth
    // export const auth = firebase.auth();
    // export const googleAuth = new auth.GoogleAuthProvider();

    // Firestore
    const db$1 = $c$1(app);

    /* node_modules/svelte-feather-icons/src/icons/ActivityIcon.svelte generated by Svelte v3.42.4 */

    const file$1 = "node_modules/svelte-feather-icons/src/icons/ActivityIcon.svelte";

    function create_fragment$1(ctx) {
    	let svg;
    	let polyline;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			polyline = svg_element("polyline");
    			attr_dev(polyline, "points", "22 12 18 12 15 21 9 3 6 12 2 12");
    			add_location(polyline, file$1, 13, 245, 531);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-activity " + /*customClass*/ ctx[2]);
    			add_location(svg, file$1, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, polyline);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-activity " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ActivityIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ActivityIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class ActivityIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ActivityIcon",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get size() {
    		throw new Error("<ActivityIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<ActivityIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<ActivityIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<ActivityIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<ActivityIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<ActivityIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-feather-icons/src/icons/CloudLightningIcon.svelte generated by Svelte v3.42.4 */

    const file$2 = "node_modules/svelte-feather-icons/src/icons/CloudLightningIcon.svelte";

    function create_fragment$2(ctx) {
    	let svg;
    	let path;
    	let polyline;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			polyline = svg_element("polyline");
    			attr_dev(path, "d", "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9");
    			add_location(path, file$2, 13, 252, 538);
    			attr_dev(polyline, "points", "13 11 9 17 15 17 11 23");
    			add_location(polyline, file$2, 13, 317, 603);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-cloud-lightning " + /*customClass*/ ctx[2]);
    			add_location(svg, file$2, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    			append_dev(svg, polyline);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-cloud-lightning " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('CloudLightningIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CloudLightningIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class CloudLightningIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CloudLightningIcon",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get size() {
    		throw new Error("<CloudLightningIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<CloudLightningIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<CloudLightningIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<CloudLightningIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<CloudLightningIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<CloudLightningIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-feather-icons/src/icons/CloudOffIcon.svelte generated by Svelte v3.42.4 */

    const file$3 = "node_modules/svelte-feather-icons/src/icons/CloudOffIcon.svelte";

    function create_fragment$3(ctx) {
    	let svg;
    	let path;
    	let line;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			line = svg_element("line");
    			attr_dev(path, "d", "M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3");
    			add_location(path, file$3, 13, 246, 532);
    			attr_dev(line, "x1", "1");
    			attr_dev(line, "y1", "1");
    			attr_dev(line, "x2", "23");
    			attr_dev(line, "y2", "23");
    			add_location(line, file$3, 13, 353, 639);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-cloud-off " + /*customClass*/ ctx[2]);
    			add_location(svg, file$3, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    			append_dev(svg, line);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-cloud-off " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('CloudOffIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CloudOffIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class CloudOffIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CloudOffIcon",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get size() {
    		throw new Error("<CloudOffIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<CloudOffIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<CloudOffIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<CloudOffIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<CloudOffIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<CloudOffIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-feather-icons/src/icons/GridIcon.svelte generated by Svelte v3.42.4 */

    const file$4 = "node_modules/svelte-feather-icons/src/icons/GridIcon.svelte";

    function create_fragment$4(ctx) {
    	let svg;
    	let rect0;
    	let rect1;
    	let rect2;
    	let rect3;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			rect0 = svg_element("rect");
    			rect1 = svg_element("rect");
    			rect2 = svg_element("rect");
    			rect3 = svg_element("rect");
    			attr_dev(rect0, "x", "3");
    			attr_dev(rect0, "y", "3");
    			attr_dev(rect0, "width", "7");
    			attr_dev(rect0, "height", "7");
    			add_location(rect0, file$4, 13, 241, 527);
    			attr_dev(rect1, "x", "14");
    			attr_dev(rect1, "y", "3");
    			attr_dev(rect1, "width", "7");
    			attr_dev(rect1, "height", "7");
    			add_location(rect1, file$4, 13, 287, 573);
    			attr_dev(rect2, "x", "14");
    			attr_dev(rect2, "y", "14");
    			attr_dev(rect2, "width", "7");
    			attr_dev(rect2, "height", "7");
    			add_location(rect2, file$4, 13, 334, 620);
    			attr_dev(rect3, "x", "3");
    			attr_dev(rect3, "y", "14");
    			attr_dev(rect3, "width", "7");
    			attr_dev(rect3, "height", "7");
    			add_location(rect3, file$4, 13, 382, 668);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-grid " + /*customClass*/ ctx[2]);
    			add_location(svg, file$4, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, rect0);
    			append_dev(svg, rect1);
    			append_dev(svg, rect2);
    			append_dev(svg, rect3);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-grid " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('GridIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<GridIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class GridIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "GridIcon",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get size() {
    		throw new Error("<GridIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<GridIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<GridIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<GridIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<GridIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<GridIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-feather-icons/src/icons/HomeIcon.svelte generated by Svelte v3.42.4 */

    const file$5 = "node_modules/svelte-feather-icons/src/icons/HomeIcon.svelte";

    function create_fragment$5(ctx) {
    	let svg;
    	let path;
    	let polyline;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			polyline = svg_element("polyline");
    			attr_dev(path, "d", "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z");
    			add_location(path, file$5, 13, 241, 527);
    			attr_dev(polyline, "points", "9 22 9 12 15 12 15 22");
    			add_location(polyline, file$5, 13, 305, 591);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-home " + /*customClass*/ ctx[2]);
    			add_location(svg, file$5, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    			append_dev(svg, polyline);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-home " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('HomeIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<HomeIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class HomeIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "HomeIcon",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get size() {
    		throw new Error("<HomeIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<HomeIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<HomeIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<HomeIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<HomeIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<HomeIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-feather-icons/src/icons/PlusCircleIcon.svelte generated by Svelte v3.42.4 */

    const file$6 = "node_modules/svelte-feather-icons/src/icons/PlusCircleIcon.svelte";

    function create_fragment$6(ctx) {
    	let svg;
    	let circle;
    	let line0;
    	let line1;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			circle = svg_element("circle");
    			line0 = svg_element("line");
    			line1 = svg_element("line");
    			attr_dev(circle, "cx", "12");
    			attr_dev(circle, "cy", "12");
    			attr_dev(circle, "r", "10");
    			add_location(circle, file$6, 13, 248, 534);
    			attr_dev(line0, "x1", "12");
    			attr_dev(line0, "y1", "8");
    			attr_dev(line0, "x2", "12");
    			attr_dev(line0, "y2", "16");
    			add_location(line0, file$6, 13, 288, 574);
    			attr_dev(line1, "x1", "8");
    			attr_dev(line1, "y1", "12");
    			attr_dev(line1, "x2", "16");
    			attr_dev(line1, "y2", "12");
    			add_location(line1, file$6, 13, 332, 618);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-plus-circle " + /*customClass*/ ctx[2]);
    			add_location(svg, file$6, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, circle);
    			append_dev(svg, line0);
    			append_dev(svg, line1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-plus-circle " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('PlusCircleIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<PlusCircleIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class PlusCircleIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "PlusCircleIcon",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get size() {
    		throw new Error("<PlusCircleIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<PlusCircleIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<PlusCircleIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<PlusCircleIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<PlusCircleIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<PlusCircleIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-feather-icons/src/icons/SettingsIcon.svelte generated by Svelte v3.42.4 */

    const file$7 = "node_modules/svelte-feather-icons/src/icons/SettingsIcon.svelte";

    function create_fragment$7(ctx) {
    	let svg;
    	let circle;
    	let path;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			circle = svg_element("circle");
    			path = svg_element("path");
    			attr_dev(circle, "cx", "12");
    			attr_dev(circle, "cy", "12");
    			attr_dev(circle, "r", "3");
    			add_location(circle, file$7, 13, 245, 531);
    			attr_dev(path, "d", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z");
    			add_location(path, file$7, 13, 284, 570);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-settings " + /*customClass*/ ctx[2]);
    			add_location(svg, file$7, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, circle);
    			append_dev(svg, path);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-settings " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('SettingsIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SettingsIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class SettingsIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "SettingsIcon",
    			options,
    			id: create_fragment$7.name
    		});
    	}

    	get size() {
    		throw new Error("<SettingsIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<SettingsIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<SettingsIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<SettingsIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<SettingsIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<SettingsIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules/svelte-feather-icons/src/icons/VideoIcon.svelte generated by Svelte v3.42.4 */

    const file$8 = "node_modules/svelte-feather-icons/src/icons/VideoIcon.svelte";

    function create_fragment$8(ctx) {
    	let svg;
    	let polygon;
    	let rect;
    	let svg_class_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			polygon = svg_element("polygon");
    			rect = svg_element("rect");
    			attr_dev(polygon, "points", "23 7 16 12 23 17 23 7");
    			add_location(polygon, file$8, 13, 242, 528);
    			attr_dev(rect, "x", "1");
    			attr_dev(rect, "y", "5");
    			attr_dev(rect, "width", "15");
    			attr_dev(rect, "height", "14");
    			attr_dev(rect, "rx", "2");
    			attr_dev(rect, "ry", "2");
    			add_location(rect, file$8, 13, 292, 578);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", /*size*/ ctx[0]);
    			attr_dev(svg, "height", /*size*/ ctx[0]);
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "stroke", "currentColor");
    			attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			attr_dev(svg, "stroke-linecap", "round");
    			attr_dev(svg, "stroke-linejoin", "round");
    			attr_dev(svg, "class", svg_class_value = "feather feather-video " + /*customClass*/ ctx[2]);
    			add_location(svg, file$8, 13, 0, 286);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, polygon);
    			append_dev(svg, rect);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "width", /*size*/ ctx[0]);
    			}

    			if (dirty & /*size*/ 1) {
    				attr_dev(svg, "height", /*size*/ ctx[0]);
    			}

    			if (dirty & /*strokeWidth*/ 2) {
    				attr_dev(svg, "stroke-width", /*strokeWidth*/ ctx[1]);
    			}

    			if (dirty & /*customClass*/ 4 && svg_class_value !== (svg_class_value = "feather feather-video " + /*customClass*/ ctx[2])) {
    				attr_dev(svg, "class", svg_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('VideoIcon', slots, []);
    	let { size = "100%" } = $$props;
    	let { strokeWidth = 2 } = $$props;
    	let { class: customClass = "" } = $$props;

    	if (size !== "100%") {
    		size = size.slice(-1) === 'x'
    		? size.slice(0, size.length - 1) + 'em'
    		: parseInt(size) + 'px';
    	}

    	const writable_props = ['size', 'strokeWidth', 'class'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<VideoIcon> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('class' in $$props) $$invalidate(2, customClass = $$props.class);
    	};

    	$$self.$capture_state = () => ({ size, strokeWidth, customClass });

    	$$self.$inject_state = $$props => {
    		if ('size' in $$props) $$invalidate(0, size = $$props.size);
    		if ('strokeWidth' in $$props) $$invalidate(1, strokeWidth = $$props.strokeWidth);
    		if ('customClass' in $$props) $$invalidate(2, customClass = $$props.customClass);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [size, strokeWidth, customClass];
    }

    class VideoIcon extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { size: 0, strokeWidth: 1, class: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "VideoIcon",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get size() {
    		throw new Error("<VideoIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<VideoIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get strokeWidth() {
    		throw new Error("<VideoIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set strokeWidth(value) {
    		throw new Error("<VideoIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<VideoIcon>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<VideoIcon>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components/Header/Header.svelte generated by Svelte v3.42.4 */
    const file$9 = "components/Header/Header.svelte";

    // (13:8) {:else}
    function create_else_block(ctx) {
    	let cloudofficon;
    	let current;
    	cloudofficon = new CloudOffIcon({ props: { size: "1.3x" }, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(cloudofficon.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(cloudofficon, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cloudofficon.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cloudofficon.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(cloudofficon, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(13:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (11:6) {#if homeServerStatus}
    function create_if_block(ctx) {
    	let cloudlightningicon;
    	let current;
    	cloudlightningicon = new CloudLightningIcon({ props: { size: "1.3x" }, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(cloudlightningicon.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(cloudlightningicon, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cloudlightningicon.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cloudlightningicon.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(cloudlightningicon, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(11:6) {#if homeServerStatus}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let header;
    	let figure;
    	let t0;
    	let t1;
    	let div;
    	let ul;
    	let li;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*homeServerStatus*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			header = element("header");
    			figure = element("figure");
    			t0 = text(/*appName*/ ctx[1]);
    			t1 = space();
    			div = element("div");
    			ul = element("ul");
    			li = element("li");
    			if_block.c();
    			add_location(figure, file$9, 6, 1, 179);
    			attr_dev(li, "class", "nav-icon svelte-kgdm00");
    			add_location(li, file$9, 9, 6, 231);
    			add_location(ul, file$9, 8, 4, 219);
    			add_location(div, file$9, 7, 1, 208);
    			attr_dev(header, "class", "svelte-kgdm00");
    			add_location(header, file$9, 5, 0, 168);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, figure);
    			append_dev(figure, t0);
    			append_dev(header, t1);
    			append_dev(header, div);
    			append_dev(div, ul);
    			append_dev(ul, li);
    			if_blocks[current_block_type_index].m(li, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*appName*/ 2) set_data_dev(t0, /*appName*/ ctx[1]);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(li, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Header', slots, []);
    	let { homeServerStatus = false } = $$props;
    	let { appName = "App" } = $$props;
    	const writable_props = ['homeServerStatus', 'appName'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Header> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('homeServerStatus' in $$props) $$invalidate(0, homeServerStatus = $$props.homeServerStatus);
    		if ('appName' in $$props) $$invalidate(1, appName = $$props.appName);
    	};

    	$$self.$capture_state = () => ({
    		CloudLightningIcon,
    		CloudOffIcon,
    		homeServerStatus,
    		appName
    	});

    	$$self.$inject_state = $$props => {
    		if ('homeServerStatus' in $$props) $$invalidate(0, homeServerStatus = $$props.homeServerStatus);
    		if ('appName' in $$props) $$invalidate(1, appName = $$props.appName);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [homeServerStatus, appName];
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { homeServerStatus: 0, appName: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Header",
    			options,
    			id: create_fragment$9.name
    		});
    	}

    	get homeServerStatus() {
    		throw new Error("<Header>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set homeServerStatus(value) {
    		throw new Error("<Header>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get appName() {
    		throw new Error("<Header>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set appName(value) {
    		throw new Error("<Header>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components/ProgressBar/ProgressBar.svelte generated by Svelte v3.42.4 */

    const file$a = "components/ProgressBar/ProgressBar.svelte";

    // (15:0) {:else}
    function create_else_block$1(ctx) {
    	let div1;
    	let div0;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			attr_dev(div0, "class", "indeterminate svelte-luhn66");
    			add_location(div0, file$a, 16, 8, 352);
    			attr_dev(div1, "class", "progress svelte-luhn66");
    			add_location(div1, file$a, 15, 4, 321);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(15:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (11:0) {#if determinate}
    function create_if_block$1(ctx) {
    	let div1;
    	let div0;
    	let div0_style_value;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			attr_dev(div0, "class", "determinate svelte-luhn66");
    			attr_dev(div0, "style", div0_style_value = `width: ${/*progress*/ ctx[0]}%`);
    			add_location(div0, file$a, 12, 8, 240);
    			attr_dev(div1, "class", "progress svelte-luhn66");
    			add_location(div1, file$a, 11, 4, 209);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*progress*/ 1 && div0_style_value !== (div0_style_value = `width: ${/*progress*/ ctx[0]}%`)) {
    				attr_dev(div0, "style", div0_style_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(11:0) {#if determinate}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*determinate*/ ctx[1]) return create_if_block$1;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ProgressBar', slots, []);
    	let { progress } = $$props;
    	let determinate = false;

    	if (typeof progress != Number) {
    		determinate = false;
    	} else {
    		determinate = true;
    	}

    	const writable_props = ['progress'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ProgressBar> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('progress' in $$props) $$invalidate(0, progress = $$props.progress);
    	};

    	$$self.$capture_state = () => ({ progress, determinate });

    	$$self.$inject_state = $$props => {
    		if ('progress' in $$props) $$invalidate(0, progress = $$props.progress);
    		if ('determinate' in $$props) $$invalidate(1, determinate = $$props.determinate);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [progress, determinate];
    }

    class ProgressBar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, { progress: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ProgressBar",
    			options,
    			id: create_fragment$a.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*progress*/ ctx[0] === undefined && !('progress' in props)) {
    			console.warn("<ProgressBar> was created without expected prop 'progress'");
    		}
    	}

    	get progress() {
    		throw new Error("<ProgressBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set progress(value) {
    		throw new Error("<ProgressBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components/board/Board.svelte generated by Svelte v3.42.4 */
    const file$b = "components/board/Board.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	child_ctx[6] = i;
    	return child_ctx;
    }

    // (11:1) {#each switches as swh, ind}
    function create_each_block(ctx) {
    	let li;
    	let p;
    	let t_value = /*swh*/ ctx[4].label + "";
    	let t;
    	let li_class_value;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[3](/*ind*/ ctx[6]);
    	}

    	const block = {
    		c: function create() {
    			li = element("li");
    			p = element("p");
    			t = text(t_value);
    			add_location(p, file$b, 12, 6, 344);
    			attr_dev(li, "class", li_class_value = "" + (null_to_empty(/*swh*/ ctx[4].state ? "item is-active" : "item") + " svelte-1ff6atf"));
    			add_location(li, file$b, 11, 4, 250);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, p);
    			append_dev(p, t);

    			if (!mounted) {
    				dispose = listen_dev(li, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*switches*/ 1 && t_value !== (t_value = /*swh*/ ctx[4].label + "")) set_data_dev(t, t_value);

    			if (dirty & /*switches*/ 1 && li_class_value !== (li_class_value = "" + (null_to_empty(/*swh*/ ctx[4].state ? "item is-active" : "item") + " svelte-1ff6atf"))) {
    				attr_dev(li, "class", li_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(11:1) {#each switches as swh, ind}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$b(ctx) {
    	let ul;
    	let t;
    	let li;
    	let pluscircleicon;
    	let current;
    	let each_value = /*switches*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	pluscircleicon = new PlusCircleIcon({ props: { size: "1.5x" }, $$inline: true });

    	const block = {
    		c: function create() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			li = element("li");
    			create_component(pluscircleicon.$$.fragment);
    			attr_dev(li, "class", "item svelte-1ff6atf");
    			add_location(li, file$b, 15, 2, 388);
    			attr_dev(ul, "class", "board svelte-1ff6atf");
    			add_location(ul, file$b, 9, 0, 195);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			append_dev(ul, t);
    			append_dev(ul, li);
    			mount_component(pluscircleicon, li, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*switches, toggleHandler*/ 3) {
    				each_value = /*switches*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, t);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(pluscircleicon.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(pluscircleicon.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(ul);
    			destroy_each(each_blocks, detaching);
    			destroy_component(pluscircleicon);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Board', slots, []);
    	let { switches } = $$props;
    	let { clickHandler } = $$props;

    	function toggleHandler(ind) {
    		clickHandler(ind);
    	}

    	const writable_props = ['switches', 'clickHandler'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Board> was created with unknown prop '${key}'`);
    	});

    	const click_handler = ind => toggleHandler(ind);

    	$$self.$$set = $$props => {
    		if ('switches' in $$props) $$invalidate(0, switches = $$props.switches);
    		if ('clickHandler' in $$props) $$invalidate(2, clickHandler = $$props.clickHandler);
    	};

    	$$self.$capture_state = () => ({
    		PlusCircleIcon,
    		switches,
    		clickHandler,
    		toggleHandler
    	});

    	$$self.$inject_state = $$props => {
    		if ('switches' in $$props) $$invalidate(0, switches = $$props.switches);
    		if ('clickHandler' in $$props) $$invalidate(2, clickHandler = $$props.clickHandler);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [switches, toggleHandler, clickHandler, click_handler];
    }

    class Board extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { switches: 0, clickHandler: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Board",
    			options,
    			id: create_fragment$b.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*switches*/ ctx[0] === undefined && !('switches' in props)) {
    			console.warn("<Board> was created without expected prop 'switches'");
    		}

    		if (/*clickHandler*/ ctx[2] === undefined && !('clickHandler' in props)) {
    			console.warn("<Board> was created without expected prop 'clickHandler'");
    		}
    	}

    	get switches() {
    		throw new Error("<Board>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set switches(value) {
    		throw new Error("<Board>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clickHandler() {
    		throw new Error("<Board>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clickHandler(value) {
    		throw new Error("<Board>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* pages/Home.svelte generated by Svelte v3.42.4 */
    const file$c = "pages/Home.svelte";

    // (1:0) <script>   import { db }
    function create_catch_block(ctx) {
    	const block = {
    		c: noop,
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_catch_block.name,
    		type: "catch",
    		source: "(1:0) <script>   import { db }",
    		ctx
    	});

    	return block;
    }

    // (80:3) {:then}
    function create_then_block(ctx) {
    	let board;
    	let current;

    	board = new Board({
    			props: {
    				switches: /*data*/ ctx[0],
    				clickHandler: /*onSwitchClicked*/ ctx[3]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(board.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(board, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const board_changes = {};
    			if (dirty & /*data*/ 1) board_changes.switches = /*data*/ ctx[0];
    			board.$set(board_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(board.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(board.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(board, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_then_block.name,
    		type: "then",
    		source: "(80:3) {:then}",
    		ctx
    	});

    	return block;
    }

    // (76:20)      <div class="progress-container">      <ProgressBar />     </div>     {:then}
    function create_pending_block(ctx) {
    	let div;
    	let progressbar;
    	let current;
    	progressbar = new ProgressBar({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(progressbar.$$.fragment);
    			attr_dev(div, "class", "progress-container svelte-1ks1zl7");
    			add_location(div, file$c, 76, 3, 1832);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(progressbar, div, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(progressbar.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(progressbar.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(progressbar);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_pending_block.name,
    		type: "pending",
    		source: "(76:20)      <div class=\\\"progress-container\\\">      <ProgressBar />     </div>     {:then}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$c(ctx) {
    	let header;
    	let t;
    	let section;
    	let div;
    	let promise;
    	let current;

    	header = new Header({
    			props: {
    				homeServerStatus: /*localServer*/ ctx[1][0].active
    			},
    			$$inline: true
    		});

    	let info = {
    		ctx,
    		current: null,
    		token: null,
    		hasCatch: false,
    		pending: create_pending_block,
    		then: create_then_block,
    		catch: create_catch_block,
    		blocks: [,,,]
    	};

    	handle_promise(promise = /*getData*/ ctx[2](), info);

    	const block = {
    		c: function create() {
    			create_component(header.$$.fragment);
    			t = space();
    			section = element("section");
    			div = element("div");
    			info.block.c();
    			attr_dev(div, "class", "group");
    			add_location(div, file$c, 74, 1, 1786);
    			add_location(section, file$c, 73, 0, 1774);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(header, target, anchor);
    			insert_dev(target, t, anchor);
    			insert_dev(target, section, anchor);
    			append_dev(section, div);
    			info.block.m(div, info.anchor = null);
    			info.mount = () => div;
    			info.anchor = null;
    			current = true;
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;
    			const header_changes = {};
    			if (dirty & /*localServer*/ 2) header_changes.homeServerStatus = /*localServer*/ ctx[1][0].active;
    			header.$set(header_changes);
    			update_await_block_branch(info, ctx, dirty);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(info.block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header.$$.fragment, local);

    			for (let i = 0; i < 3; i += 1) {
    				const block = info.blocks[i];
    				transition_out(block);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(header, detaching);
    			if (detaching) detach_dev(t);
    			if (detaching) detach_dev(section);
    			info.block.d();
    			info.token = null;
    			info = null;
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Home', slots, []);
    	let data = [];
    	let localServer = [{ active: false }];
    	const q = Fu(Rc$1(db$1, "boards/my-room/switches"), Lu("label", "!=", ""));
    	const s = Fu(Rc$1(db$1, "local-server"), Lu("active", "!=", ""));

    	const unsubscribe = gh(q, querySnapshot => {
    		$$invalidate(0, data = []);

    		querySnapshot.forEach(doc => {
    			$$invalidate(0, data = [...data, doc.data()]);
    		});
    	});

    	const unsub1 = gh(s, querySnapshot => {
    		$$invalidate(1, localServer = []);

    		querySnapshot.forEach(doc => {
    			localServer.push(doc.data());
    		});
    	});

    	async function getData() {
    		const querySnapshot = await hh(Rc$1(db$1, "boards/my-room/switches"));

    		querySnapshot.forEach(doc => {
    			data.push(doc.data());
    		});
    	}

    	async function getServerData() {
    		const querySnapshot = await hh(Rc$1(db$1, "local-server"));

    		querySnapshot.forEach(doc => {
    			localServer.push(doc.data());
    		});
    	}

    	onDestroy(() => {
    		unsubscribe();
    		unsub1();
    	});

    	onMount(() => {
    		getServerData();
    	});

    	async function onSwitchClicked(ind) {
    		await dh(bc$1(db$1, "boards/my-room/switches", data[ind].label), {
    			label: data[ind].label,
    			state: !data[ind].state,
    			type: data[ind].type
    		});
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Home> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		db: db$1,
    		Header,
    		ProgressBar,
    		collection: Rc$1,
    		getDocs: hh,
    		doc: bc$1,
    		onSnapshot: gh,
    		setDoc: dh,
    		query: Fu,
    		where: Lu,
    		onMount,
    		onDestroy,
    		Board,
    		data,
    		localServer,
    		q,
    		s,
    		unsubscribe,
    		unsub1,
    		getData,
    		getServerData,
    		onSwitchClicked
    	});

    	$$self.$inject_state = $$props => {
    		if ('data' in $$props) $$invalidate(0, data = $$props.data);
    		if ('localServer' in $$props) $$invalidate(1, localServer = $$props.localServer);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [data, localServer, getData, onSwitchClicked];
    }

    class Home extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Home",
    			options,
    			id: create_fragment$c.name
    		});
    	}
    }

    /* pages/Video.svelte generated by Svelte v3.42.4 */

    function create_fragment$d(ctx) {
    	const block = {
    		c: noop,
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$d.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$d($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Video', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Video> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Video extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Video",
    			options,
    			id: create_fragment$d.name
    		});
    	}
    }

    /* pages/Activity.svelte generated by Svelte v3.42.4 */

    function create_fragment$e(ctx) {
    	const block = {
    		c: noop,
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$e.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$e($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Activity', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Activity> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Activity extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Activity",
    			options,
    			id: create_fragment$e.name
    		});
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    /* components/Nav.svelte generated by Svelte v3.42.4 */
    const file$d = "components/Nav.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	child_ctx[6] = i;
    	return child_ctx;
    }

    // (9:4) {#each navItems as item, ind}
    function create_each_block$1(ctx) {
    	let li;
    	let switch_instance;
    	let t;
    	let li_class_value;
    	let li_transition;
    	let current;
    	let mounted;
    	let dispose;
    	var switch_value = /*item*/ ctx[4].icon;

    	function switch_props(ctx) {
    		return {
    			props: {
    				size: "1.5x",
    				strokeWidth: /*activeNav*/ ctx[1] === /*ind*/ ctx[6]
    				? "2px"
    				: "1.3px"
    			},
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props(ctx));
    	}

    	function click_handler() {
    		return /*click_handler*/ ctx[3](/*ind*/ ctx[6]);
    	}

    	const block = {
    		c: function create() {
    			li = element("li");
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			t = space();

    			attr_dev(li, "class", li_class_value = "" + (null_to_empty(/*activeNav*/ ctx[1] === /*ind*/ ctx[6]
    			? 'active-item'
    			: "") + " svelte-xsw3kz"));

    			add_location(li, file$d, 9, 6, 212);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);

    			if (switch_instance) {
    				mount_component(switch_instance, li, null);
    			}

    			append_dev(li, t);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(li, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const switch_instance_changes = {};

    			if (dirty & /*activeNav*/ 2) switch_instance_changes.strokeWidth = /*activeNav*/ ctx[1] === /*ind*/ ctx[6]
    			? "2px"
    			: "1.3px";

    			if (switch_value !== (switch_value = /*item*/ ctx[4].icon)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, li, t);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}

    			if (!current || dirty & /*activeNav*/ 2 && li_class_value !== (li_class_value = "" + (null_to_empty(/*activeNav*/ ctx[1] === /*ind*/ ctx[6]
    			? 'active-item'
    			: "") + " svelte-xsw3kz"))) {
    				attr_dev(li, "class", li_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);

    			add_render_callback(() => {
    				if (!li_transition) li_transition = create_bidirectional_transition(li, scale, {}, true);
    				li_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			if (!li_transition) li_transition = create_bidirectional_transition(li, scale, {}, false);
    			li_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (switch_instance) destroy_component(switch_instance);
    			if (detaching && li_transition) li_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(9:4) {#each navItems as item, ind}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$f(ctx) {
    	let nav;
    	let ul;
    	let current;
    	let each_value = /*navItems*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			nav = element("nav");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(ul, "class", "svelte-xsw3kz");
    			add_location(ul, file$d, 7, 2, 165);
    			add_location(nav, file$d, 6, 0, 156);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, nav, anchor);
    			append_dev(nav, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*activeNav, navEventHandler, navItems*/ 7) {
    				each_value = /*navItems*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(nav);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$f.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Nav', slots, []);
    	let { navItems = [] } = $$props;
    	let { activeNav = 0 } = $$props;
    	let { navEventHandler } = $$props;
    	const writable_props = ['navItems', 'activeNav', 'navEventHandler'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Nav> was created with unknown prop '${key}'`);
    	});

    	const click_handler = ind => navEventHandler(ind);

    	$$self.$$set = $$props => {
    		if ('navItems' in $$props) $$invalidate(0, navItems = $$props.navItems);
    		if ('activeNav' in $$props) $$invalidate(1, activeNav = $$props.activeNav);
    		if ('navEventHandler' in $$props) $$invalidate(2, navEventHandler = $$props.navEventHandler);
    	};

    	$$self.$capture_state = () => ({
    		scale,
    		navItems,
    		activeNav,
    		navEventHandler
    	});

    	$$self.$inject_state = $$props => {
    		if ('navItems' in $$props) $$invalidate(0, navItems = $$props.navItems);
    		if ('activeNav' in $$props) $$invalidate(1, activeNav = $$props.activeNav);
    		if ('navEventHandler' in $$props) $$invalidate(2, navEventHandler = $$props.navEventHandler);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [navItems, activeNav, navEventHandler, click_handler];
    }

    class Nav extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$f, create_fragment$f, safe_not_equal, {
    			navItems: 0,
    			activeNav: 1,
    			navEventHandler: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Nav",
    			options,
    			id: create_fragment$f.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*navEventHandler*/ ctx[2] === undefined && !('navEventHandler' in props)) {
    			console.warn("<Nav> was created without expected prop 'navEventHandler'");
    		}
    	}

    	get navItems() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set navItems(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activeNav() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeNav(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get navEventHandler() {
    		throw new Error("<Nav>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set navEventHandler(value) {
    		throw new Error("<Nav>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* App.svelte generated by Svelte v3.42.4 */

    const file$e = "App.svelte";

    // (69:4) {:else}
    function create_else_block$2(ctx) {
    	let meta;

    	const block = {
    		c: function create() {
    			meta = element("meta");
    			attr_dev(meta, "name", "theme-color");
    			attr_dev(meta, "content", "#e8e8e8");
    			add_location(meta, file$e, 69, 4, 1525);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, meta, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(meta);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(69:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (67:2) {#if $theme === "dark"}
    function create_if_block$2(ctx) {
    	let meta;

    	const block = {
    		c: function create() {
    			meta = element("meta");
    			attr_dev(meta, "name", "theme-color");
    			attr_dev(meta, "content", "#171717");
    			add_location(meta, file$e, 67, 4, 1465);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, meta, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(meta);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(67:2) {#if $theme === \\\"dark\\\"}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$g(ctx) {
    	let if_block_anchor;
    	let t0;
    	let main;
    	let section;
    	let switch_instance;
    	let t1;
    	let footer;
    	let nav;
    	let main_class_value;
    	let current;

    	function select_block_type(ctx, dirty) {
    		if (/*$theme*/ ctx[1] === "dark") return create_if_block$2;
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);
    	var switch_value = /*navItems*/ ctx[2][/*activeNav*/ ctx[0]].comp;

    	function switch_props(ctx) {
    		return { $$inline: true };
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	nav = new Nav({
    			props: {
    				navItems: /*navItems*/ ctx[2],
    				activeNav: /*activeNav*/ ctx[0],
    				navEventHandler: /*navEventHandler*/ ctx[3]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    			t0 = space();
    			main = element("main");
    			section = element("section");
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			t1 = space();
    			footer = element("footer");
    			create_component(nav.$$.fragment);
    			add_location(section, file$e, 73, 2, 1627);
    			attr_dev(footer, "class", "svelte-1tj11bt");
    			add_location(footer, file$e, 76, 2, 1709);
    			attr_dev(main, "class", main_class_value = "" + (null_to_empty(/*$theme*/ ctx[1] + "-theme") + " svelte-1tj11bt"));
    			add_location(main, file$e, 72, 0, 1592);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_block.m(document.head, null);
    			append_dev(document.head, if_block_anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, section);

    			if (switch_instance) {
    				mount_component(switch_instance, section, null);
    			}

    			append_dev(main, t1);
    			append_dev(main, footer);
    			mount_component(nav, footer, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}

    			if (switch_value !== (switch_value = /*navItems*/ ctx[2][/*activeNav*/ ctx[0]].comp)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, section, null);
    				} else {
    					switch_instance = null;
    				}
    			}

    			const nav_changes = {};
    			if (dirty & /*activeNav*/ 1) nav_changes.activeNav = /*activeNav*/ ctx[0];
    			nav.$set(nav_changes);

    			if (!current || dirty & /*$theme*/ 2 && main_class_value !== (main_class_value = "" + (null_to_empty(/*$theme*/ ctx[1] + "-theme") + " svelte-1tj11bt"))) {
    				attr_dev(main, "class", main_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			transition_in(nav.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			transition_out(nav.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_block.d(detaching);
    			detach_dev(if_block_anchor);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (switch_instance) destroy_component(switch_instance);
    			destroy_component(nav);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$g.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$g($$self, $$props, $$invalidate) {
    	let $theme;
    	validate_store(theme, 'theme');
    	component_subscribe($$self, theme, $$value => $$invalidate(1, $theme = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);

    	const navItems = [
    		{
    			label: "Home",
    			icon: HomeIcon,
    			comp: Home
    		},
    		{
    			label: "Activity",
    			icon: GridIcon,
    			comp: Activity
    		},
    		{
    			label: "Monitor",
    			icon: VideoIcon,
    			comp: Video
    		},
    		{
    			label: "Control",
    			icon: SettingsIcon,
    			comp: Controls
    		}
    	];

    	let activeNav = 0;

    	function navEventHandler(ind) {
    		$$invalidate(0, activeNav = ind);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		Controls,
    		Home,
    		Video,
    		Activity,
    		Nav,
    		theme,
    		HomeIcon,
    		ActivityIcon,
    		SettingsIcon,
    		VideoIcon,
    		GridIcon,
    		navItems,
    		activeNav,
    		navEventHandler,
    		$theme
    	});

    	$$self.$inject_state = $$props => {
    		if ('activeNav' in $$props) $$invalidate(0, activeNav = $$props.activeNav);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [activeNav, $theme, navItems, navEventHandler];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$g, create_fragment$g, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$g.name
    		});
    	}
    }

    const app$1 = new App({
      target: document.body
    });

    return app$1;

}());
//# sourceMappingURL=bundle.js.map
