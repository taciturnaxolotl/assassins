<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Alert from '$lib/components/ui/alert';
	import PlayerCombobox from '$lib/components/PlayerCombobox.svelte';

	let { data, form } = $props();

	let fixing = $state<string | null>(null);
	let fixTo = $state<Record<string, string>>({});

	// What an admin has changed a GroupMe proposal to, before recording it.
	let picked = $state<Record<string, { killer?: string; victim?: string }>>({});
	const choose = (id: string, side: 'killer' | 'victim', v: string) =>
		(picked = { ...picked, [id]: { ...picked[id], [side]: v } });
	// Who an admin says a queued snipe is of, before filing it.
	let sniped = $state<Record<string, string>>({});
	let q = $state('');

	const waiting = $derived(data.needs.claims.length + data.needs.kills.length);

	const settled = $derived(
		data.settled.filter(
			(r) =>
				!q ||
				`${r.user.name} ${r.user.email} ${r.as}`.toLowerCase().includes(q.toLowerCase())
		)
	);

	const when = (d: string | Date) =>
		new Date(d).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
</script>

<svelte:head><title>Queue · Assassins</title></svelte:head>

<header>
	<h1>Queue</h1>
	{#if waiting}
		<Badge variant="destructive">{waiting} waiting</Badge>
	{:else}
		<span class="clear">nothing waiting</span>
	{/if}
	<nav><a href="/target">Back to the game</a></nav>
</header>

<main>
	{#if form?.message}
		<Alert.Root class="mb-5"><Alert.Description>{form.message}</Alert.Description></Alert.Root>
	{/if}

	<!-- ── what needs a person ──────────────────────────────────────────── -->

	{#if data.groupme.on}
		<section>
			<h2 class="rule">From the kills topic</h2>
			{#if data.groupme.error}
				<Alert.Root variant="destructive" class="mb-3">
					<Alert.Description>{data.groupme.error}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if !data.groupme.synced}
				<p class="legal">
					People announce kills in GroupMe long before they think to open this.
					Reading asks GroupMe for the last sixty messages in each topic. Snipes
					that are a name and a photograph and nothing else file themselves; the
					rest wait here.
				</p>
				<form method="POST" action="?/syncGroupMe" use:enhance>
					<Button class="mt-3" type="submit">Read the topics</Button>
				</form>
			{:else if !data.groupme.proposals.length}
				<p class="empty">Nothing in the kills topic that has not been dealt with.</p>
			{:else}
				<p class="legal">
					The sender is certain; the victim is a guess, and the message is
					underneath so you can see what it is guessing from.
				</p>
				<div class="rows">
					{#each data.groupme.proposals as p (p.messageId)}
						<article class="row act" class:vouched={p.killerGmId && p.victimGmId}>
							<div class="story">
								{#if p.image}
									<img class="proof" src={p.image} alt="" loading="lazy" />
								{/if}
								{#if p.text}<p class="quote">“{p.text}”</p>{/if}
								<div class="legal">{p.announcedBy} · {when(p.at)} · {p.basis}</div>
							</div>

							<form method="POST" action="?/fromGroupMe" use:enhance class="read">
								<input type="hidden" name="messageId" value={p.messageId} />
								<input type="hidden" name="image" value={p.image ?? ''} />
								<input
									type="hidden"
									name="killerGmId"
									value={picked[p.messageId]?.killer ?? p.killerGmId ?? ''}
								/>
								<input
									type="hidden"
									name="victimGmId"
									value={picked[p.messageId]?.victim ?? p.victimGmId ?? ''}
								/>
								<div class="who">
									<PlayerCombobox
										options={data.roster}
										extras={[{ value: '', label: "Nobody knows who got them" }]}
										value={picked[p.messageId]?.killer ?? p.killerGmId ?? ''}
										placeholder="Nobody knows who got them"
										exclude={picked[p.messageId]?.victim ?? p.victimGmId}
										onpick={(v) => choose(p.messageId, 'killer', v)}
									/>
									<span class="arrow">got</span>
									<PlayerCombobox
										options={data.roster}
										value={picked[p.messageId]?.victim ?? p.victimGmId ?? ''}
										placeholder="Who went down"
										exclude={picked[p.messageId]?.killer ?? p.killerGmId}
										onpick={(v) => choose(p.messageId, 'victim', v)}
									/>
								</div>
								<div class="pair">
									<!-- Only the victim is required. Half the roster will never sign
									     in, so insisting on a killer would mean half the kills could
									     not be recorded at all. -->
									<Button
										size="sm"
										name="verdict"
										value="confirm"
										type="submit"
										disabled={!(picked[p.messageId]?.victim ?? p.victimGmId)}
									>
										Record it
									</Button>
									<Button size="sm" variant="outline" name="verdict" value="ignore" type="submit">
										Not a kill
									</Button>
								</div>
							</form>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	{#if data.groupme.snipesOn && data.groupme.synced && data.groupme.snipes.length}
		<section>
			<h2 class="rule">Snipes — {data.groupme.snipes.length}</h2>
			<p class="legal">
				These said more than a name, so the reader would not file them on its
				own. Say who is in the photograph, or leave it.
			</p>
			<div class="rows">
				{#each data.groupme.snipes as s (s.messageId)}
					<article class="row act">
						<div class="story">
							<img class="proof" src={s.image} alt="" loading="lazy" />
							{#if s.text}<p class="quote">“{s.text}”</p>{/if}
							<div class="legal">{s.sniper} · {when(s.at)} · {s.basis}</div>
						</div>
						<form method="POST" action="?/snipe" use:enhance class="read">
							<input type="hidden" name="messageId" value={s.messageId} />
							<input type="hidden" name="image" value={s.image} />
							<input type="hidden" name="gmId" value={sniped[s.messageId] ?? s.gmId ?? ''} />
							<div class="who">
								<PlayerCombobox
									options={data.roster}
									value={sniped[s.messageId] ?? s.gmId ?? ''}
									placeholder="Who is in it"
									onpick={(v) => (sniped = { ...sniped, [s.messageId]: v })}
								/>
							</div>
							<div class="pair">
								<Button
									size="sm"
									name="verdict"
									value="confirm"
									type="submit"
									disabled={!(sniped[s.messageId] ?? s.gmId)}
								>
									File it
								</Button>
								<Button size="sm" variant="outline" name="verdict" value="ignore" type="submit">
									Not a snipe
								</Button>
							</div>
						</form>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.groupme.filed.length}
		<section>
			<h2 class="rule">Filed on sight</h2>
			<p class="legal">
				A name and a photograph and nothing else, so these went straight onto the
				person they name. Take one back off and the next read will offer it again.
			</p>
			<div class="filed">
				{#each data.groupme.filed as f (f.messageId)}
					<figure>
						<img src={f.url} alt="" loading="lazy" />
						<figcaption>
							<span>{f.of}</span>
							<form method="POST" action="?/unfileSnipe" use:enhance>
								<input type="hidden" name="messageId" value={f.messageId} />
								<button type="submit">undo</button>
							</form>
						</figcaption>
					</figure>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.needs.kills.length}
		<section>
			<h2 class="rule">Reported kills — {data.needs.kills.length}</h2>
			<p class="legal">
				Until you confirm one, the victim is still hunting and the killer has
				inherited nothing.
			</p>
			<div class="rows">
				{#each data.needs.kills as k (k.victimGmId)}
					<article class="row act">
						<div class="story">
							<strong>{k.killer ?? 'Somebody'}</strong> took out
							<strong class="blood">{k.victim}</strong>
							{#if k.wins}
								<span class="live">— confirming this ends the game</span>
							{:else if k.inherits}
								<span class="faint">and would inherit {k.inherits}</span>
							{:else}
								<span class="faint">and inherits nothing — {k.victim} never reported a draw</span>
							{/if}
							<div class="legal">{when(k.at)}</div>
						</div>
						<form method="POST" action="?/kill" use:enhance class="pair">
							<input type="hidden" name="victimGmId" value={k.victimGmId} />
							<Button size="sm" name="verdict" value="confirm" type="submit">Confirm</Button>
							<Button size="sm" variant="outline" name="verdict" value="reject" type="submit">
								Throw out
							</Button>
						</form>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.needs.claims.length}
		<section>
			<h2 class="rule">Claims — {data.needs.claims.length}</h2>
			<div class="rows">
				{#each data.needs.claims as r (r.userId)}
					<article class="row" class:vouched={r.vouched} class:agent={r.freeAgent}>
						<div class="top">
							<div>
								<div class="nm">{r.user.name}</div>
								<div class="legal">{r.user.email}</div>
							</div>
							<div class="arrow">plays as</div>
							<div>
								<div class="nm blood">{r.as}</div>
								{#if r.freeAgent}
									<div class="legal">outside the ring — nothing to verify</div>
								{:else if r.vouched}
									<div class="legal live">the directory agrees</div>
								{:else}
									<div class="legal warn">no directory match — check this one</div>
								{/if}
							</div>
							<div class="legal">{when(r.createdAt)}</div>
						</div>

						{#if r.pitch}<p class="pitch">“{r.pitch}”</p>{/if}

						<div class="acts">
							<form method="POST" action="?/decide" use:enhance class="pair">
								<input type="hidden" name="userId" value={r.userId} />
								<input type="hidden" name="gmId" value={r.gmId ?? ''} />
								<Button size="sm" name="status" value="approved" type="submit">Approve</Button>
								<Button size="sm" variant="outline" name="status" value="denied" type="submit">
									Deny
								</Button>
							</form>
							{#if !r.freeAgent}
								<Button
									size="sm"
									variant="ghost"
									onclick={() => (fixing = fixing === r.userId ? null : r.userId)}
								>
									{fixing === r.userId ? 'Never mind' : 'Wrong player?'}
								</Button>
							{/if}
							<form method="POST" action="/admin/spoof">
								<input type="hidden" name="userId" value={r.userId} />
								<Button size="sm" variant="ghost" type="submit">View as them</Button>
							</form>
						</div>

						{#if fixing === r.userId}
							<form method="POST" action="?/decide" class="fix" use:enhance>
								<input type="hidden" name="userId" value={r.userId} />
								<input type="hidden" name="gmId" value={fixTo[r.userId] ?? r.gmId} />
								<PlayerCombobox
									options={data.roster}
									value={fixTo[r.userId] ?? r.gmId ?? ''}
									placeholder="Pick the right player"
									onpick={(v) => (fixTo = { ...fixTo, [r.userId]: v })}
								/>
								<Input name="verdict" autocomplete="off" placeholder="why, for the record" />
								<Button size="sm" name="status" value="approved" type="submit">
									Approve as this player instead
								</Button>
							</form>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if !waiting}
		<p class="empty">Nothing needs you.</p>
	{/if}

	<!-- ── where the game stands ────────────────────────────────────────── -->

	<section>
		<h2 class="rule">The game</h2>
		<dl class="stats">
			<div><dt>Playing</dt><dd>{data.state.players}</dd></div>
			<div><dt>Signed in</dt><dd>{data.state.claimed}</dd></div>
			<div><dt>Draws reported</dt><dd>{data.state.reported}</dd></div>
			<div><dt>Down</dt><dd>{data.state.down}</dd></div>
			<div><dt>Paid</dt><dd>{data.state.pro}</dd></div>
			<div><dt>Free agents</dt><dd>{data.state.agents}</dd></div>
		</dl>

		{#if data.state.quiet}
			<p class="legal">
				<strong class="warn">{data.state.quiet}</strong> signed in and alive but have
				not said who they drew. Every one is a gap in the ring.
			</p>
		{/if}
		{#if data.state.unidentified}
			<p class="legal">
				<strong class="warn">{data.state.unidentified}</strong> players the build
				could not resolve to a student. They settle in
				<code>data/overrides.tsv</code>, or when they sign in and the directory
				answers for them.
			</p>
		{/if}
	</section>

	{#if data.unclaimed.length}
		<section>
			<details class="fold">
				<summary>
					Not signed in — {data.unclaimed.length} of {data.state.players}
				</summary>
				<p class="legal">
					On the roster, nobody has claimed them. These are who to chase — or
					step into, which makes the account they would have had. They keep it
					when they sign in.
				</p>
				<div class="scroller"><table class="sheet">
					<tbody>
						{#each data.unclaimed as p (p.gmId)}
							<tr>
								<td><a href="/player/{p.gmId}" class:unknown={!p.matched}>{p.name}</a></td>
								<td class="legal">{p.matched ? '' : 'unidentified'}</td>
								<td class="right">
									<form method="POST" action="/admin/spoof">
										<input type="hidden" name="gmId" value={p.gmId} />
										<Button size="sm" variant="ghost" type="submit">View as</Button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table></div>
			</details>
		</section>
	{/if}

	<!-- ── history ──────────────────────────────────────────────────────── -->

	<section>
		<h2 class="rule">Decided — {data.settled.length}</h2>
		{#if data.settled.length > 8}
			<Input
				class="mb-3"
				type="search"
				placeholder="name or email…"
				oninput={(e) => (q = e.currentTarget.value)}
			/>
		{/if}
		{#if !settled.length}
			<p class="empty">Nothing yet.</p>
		{:else}
			<div class="scroller"><table class="sheet">
				<thead>
					<tr><th>Account</th><th>Plays as</th><th>Plan</th><th>Decided</th><th></th></tr>
				</thead>
				<tbody>
					{#each settled as r (r.userId)}
						<tr class:gone={r.status === 'denied'}>
							<td>
								{r.user.name}
								<div class="legal">{r.user.email}</div>
							</td>
							<td>
								{r.as}
								{#if r.status === 'denied'}<span class="faint"> — denied</span>{/if}
								{#if r.verdict}<div class="legal">{r.verdict}</div>{/if}
							</td>
							<td>
								<form method="POST" action="?/comp" use:enhance>
									<Button
										size="sm"
										variant={r.user.plan === 'pro' ? 'default' : 'outline'}
										type="submit"
										name="plan"
										value={r.user.plan === 'pro' ? 'free' : 'pro'}
										title={r.user.plan === 'pro' ? 'Drop to free' : 'Unlock for free'}
									>
										{r.user.plan}
									</Button>
									<input type="hidden" name="userId" value={r.userId} />
								</form>
							</td>
							<td class="legal">{r.decidedAt ? when(r.decidedAt) : ''}</td>
							<td class="tools">
								<form method="POST" action="/admin/spoof">
									<input type="hidden" name="userId" value={r.userId} />
									<Button size="sm" variant="outline" type="submit" title="See exactly what they see">
										View as
									</Button>
								</form>
								<form method="POST" action="?/decide" use:enhance>
									<input type="hidden" name="userId" value={r.userId} />
									<input type="hidden" name="gmId" value={r.gmId ?? ''} />
									<Button
										size="sm"
										variant="ghost"
										name="status"
										value="pending"
										type="submit"
										title="Undo this decision and put the claim back in the queue"
									>
										Back to queue
									</Button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table></div>
		{/if}
	</section>
</main>

<style>
	header {
		display: flex;
		align-items: baseline;
		gap: 14px;
		padding: 14px 22px;
		border-bottom: 1px solid var(--color-line);
	}
	h1 {
		font: 400 28px/1 var(--font-serif);
	}
	.clear {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-live);
	}
	nav {
		margin-left: auto;
	}
	nav a {
		color: var(--color-faint);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	nav a:hover {
		color: var(--color-blood);
	}

	main {
		max-width: 940px;
		margin: 0 auto;
		padding: 22px;
	}
	section {
		margin-bottom: 34px;
	}
	h2.rule {
		font-family: var(--font-mono);
		margin-top: 0;
	}

	.rows {
		display: grid;
		gap: 8px;
	}
	.row {
		background: var(--color-panel);
		border: 1px solid var(--color-line);
		/* The left edge carries the verdict you can make at a glance. */
		border-left: 2px solid var(--color-warn);
		border-radius: 3px;
		padding: 13px 15px;
	}
	.row.vouched {
		border-left-color: var(--color-live);
	}
	.row.agent {
		border-left-color: var(--color-dim);
	}
	.row.act {
		border-left-color: var(--color-blood);
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.row.act .story {
		flex: 1 1 320px;
		line-height: 1.6;
	}

	.top {
		display: grid;
		grid-template-columns: 1fr auto 1fr auto;
		gap: 14px;
		align-items: center;
	}
	.nm {
		font: 400 17px/1.2 var(--font-serif);
	}
	.nm.blood,
	strong.blood {
		color: var(--color-blood);
	}
	strong {
		font-weight: 400;
		color: var(--color-ink);
	}
	.arrow {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	.legal.live,
	.live {
		color: var(--color-live);
	}
	.legal.warn,
	.warn {
		color: var(--color-warn);
	}

	.read {
		display: grid;
		gap: 10px;
		flex: 1 1 340px;
	}
	.who {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 8px;
		align-items: center;
	}
	.who .arrow {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	@media (max-width: 620px) {
		.who {
			grid-template-columns: 1fr;
		}
	}
	.proof {
		display: block;
		max-height: 160px;
		border-radius: 3px;
		border: 1px solid var(--color-line);
		margin-bottom: 8px;
	}
	.quote {
		margin: 8px 0 4px;
		font-family: var(--font-serif);
		font-size: 15px;
		color: var(--color-dim);
	}
	.pitch {
		margin-top: 10px;
		font-family: var(--font-serif);
		font-size: 15px;
		color: var(--color-dim);
	}

	/* Filed snipes read as a contact sheet: small, dense, and every one of them
	   an undo away. */
	.filed {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 10px;
	}
	.filed figure {
		margin: 0;
		border: 1px solid var(--color-line);
		border-radius: 3px;
		overflow: hidden;
		background: var(--color-panel);
	}
	.filed img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		display: block;
	}
	.filed figcaption {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 6px;
		padding: 5px 7px;
		font-size: 11px;
	}
	.filed figcaption span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.filed figcaption button {
		background: none;
		border: 0;
		padding: 0;
		color: var(--color-dim);
		cursor: pointer;
		text-decoration: underline;
		font: inherit;
	}
	.filed figcaption button:hover {
		color: var(--color-blood);
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 12px;
	}
	.pair {
		display: flex;
		gap: 6px;
	}
	.fix {
		display: grid;
		gap: 6px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--color-line);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 1px;
		background: var(--color-line);
		border: 1px solid var(--color-line);
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 12px;
	}
	.stats div {
		background: var(--color-panel);
		padding: 11px 13px;
	}
	.stats dt {
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-faint);
	}
	.stats dd {
		font: 400 24px/1.1 var(--font-serif);
		margin-top: 3px;
	}

	.fold > summary {
		font: 500 11px/1 var(--font-mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-faint);
		padding-bottom: 8px;
	}
	.sheet a {
		color: var(--color-dim);
	}
	.sheet a:hover {
		color: var(--color-blood);
	}
	.sheet a.unknown {
		color: var(--color-warn);
	}
	td.right {
		text-align: right;
	}

	.sheet td form {
		display: inline;
	}
	td.tools {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	code {
		color: var(--color-dim);
	}

	@media (max-width: 620px) {
		.top {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
