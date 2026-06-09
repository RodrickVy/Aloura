<script lang="ts">
  interface Props { report: any; }
  let { report }: Props = $props();

  const colorSets   = $derived(Array.isArray(report?.color_sets) ? report.color_sets : []);
  const avoid       = $derived(report?.avoid_colors ?? {});
  const accessories = $derived(report?.accessories ?? {});
  const frames      = $derived(report?.frames ?? {});
  const recStyles   = $derived(Array.isArray(report?.recommended_styles) ? report.recommended_styles : []);
</script>

<div class="sr">
  {#if report?.summary}
    <p class="sr__summary">{report.summary}</p>
  {/if}

  <!-- Skin / undertone / face -->
  <div class="sr__facts">
    {#if report?.skin_tone}<span class="sr__fact"><b>Skin tone</b> {report.skin_tone}</span>{/if}
    {#if report?.undertone}<span class="sr__fact"><b>Undertone</b> {report.undertone}</span>{/if}
    {#if report?.face_shape}<span class="sr__fact"><b>Face shape</b> {report.face_shape}</span>{/if}
  </div>

  <!-- Colour intelligence -->
  {#if colorSets.length}
    <section class="sr__section">
      <h3 class="sr__h">Colour intelligence</h3>
      <div class="sr__colorsets">
        {#each colorSets as set}
          <div class="sr__colorset">
            <div class="sr__set-label">{set.label}</div>
            <div class="sr__swatches">
              {#each (set.colors ?? []) as c}<span class="sr__swatch" style="background:{c}" title={c}></span>{/each}
            </div>
            {#if set.note}<p class="sr__note">{set.note}</p>{/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Colours to avoid -->
  {#if (avoid.colors ?? []).length}
    <section class="sr__section">
      <h3 class="sr__h">Colours to use sparingly</h3>
      <div class="sr__swatches">
        {#each avoid.colors as c}<span class="sr__swatch sr__swatch--avoid" style="background:{c}" title={c}></span>{/each}
      </div>
      {#if avoid.note}<p class="sr__note">{avoid.note}</p>{/if}
    </section>
  {/if}

  <!-- Accessories -->
  {#if accessories.note || accessories.metals}
    <section class="sr__section">
      <h3 class="sr__h">Accessories</h3>
      <ul class="sr__list">
        {#if accessories.metals}<li><b>Metals:</b> {accessories.metals}</li>{/if}
        {#if accessories.chains}<li><b>Chains:</b> {accessories.chains}</li>{/if}
        {#if accessories.earrings}<li><b>Earrings:</b> {accessories.earrings}</li>{/if}
      </ul>
      {#if accessories.note}<p class="sr__note">{accessories.note}</p>{/if}
    </section>
  {/if}

  <!-- Frames -->
  {#if (frames.shapes ?? []).length || frames.note}
    <section class="sr__section">
      <h3 class="sr__h">Eyewear frames</h3>
      {#if (frames.shapes ?? []).length}
        <div class="sr__chips">{#each frames.shapes as s}<span class="sr__chip">{s}</span>{/each}</div>
      {/if}
      {#if frames.note}<p class="sr__note">{frames.note}</p>{/if}
    </section>
  {/if}

  <!-- Styles -->
  {#if recStyles.length}
    <section class="sr__section">
      <h3 class="sr__h">Your styles</h3>
      <div class="sr__chips">
        {#each recStyles as s}
          <span class="sr__chip" class:sr__chip--signature={s === report.signature_style}>{s}{#if s === report.signature_style} ★{/if}</span>
        {/each}
      </div>
      {#if report.signature_style}<p class="sr__note">Signature style: <b>{report.signature_style}</b></p>{/if}
    </section>
  {/if}
</div>

<style>
  .sr { display: flex; flex-direction: column; gap: var(--space-6); }
  .sr__summary { font-size: 15px; font-weight: 300; line-height: 1.6; color: var(--clr-charcoal); }
  .sr__facts { display: flex; flex-wrap: wrap; gap: 8px; }
  .sr__fact { font-size: 12px; color: var(--clr-taupe); background: var(--clr-beige); border-radius: 999px; padding: 5px 12px; }
  .sr__fact b { color: var(--clr-charcoal); font-weight: 600; margin-right: 4px; }

  .sr__section { display: flex; flex-direction: column; gap: 10px; }
  .sr__h { font-family: var(--font-display); font-size: 17px; font-weight: 500; color: var(--clr-charcoal); }
  .sr__colorsets { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
  .sr__colorset { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: 12px; padding: 12px; }
  .sr__set-label { font-size: 12px; font-weight: 600; color: var(--clr-brown); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .sr__swatches { display: flex; gap: 8px; flex-wrap: wrap; }
  .sr__swatch { width: 34px; height: 34px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--clr-border); }
  .sr__swatch--avoid { opacity: 0.85; box-shadow: 0 0 0 1.5px #e0b4b4; }
  .sr__note { font-size: 13px; font-weight: 300; color: var(--clr-taupe); line-height: 1.5; margin-top: 8px; }
  .sr__list { display: flex; flex-direction: column; gap: 4px; }
  .sr__list li { font-size: 14px; color: var(--clr-charcoal); }
  .sr__chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .sr__chip { font-size: 13px; font-weight: 500; color: var(--clr-charcoal); background: var(--clr-beige); border-radius: 999px; padding: 6px 14px; }
  .sr__chip--signature { background: var(--clr-charcoal); color: #fff; }
</style>
