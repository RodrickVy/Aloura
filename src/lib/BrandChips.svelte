<script lang="ts">
  interface Brand { id: string; name: string; logo: string; }
  interface Props {
    selected?: string | null;
    onselect: (brand: Brand) => void;
  }

  let { selected = null, onselect }: Props = $props();

  export const BRANDS = [
    { id:'amazon',         name:'Amazon',          logo:'/assets/logos/amazon.png' },
    { id:'asos',           name:'ASOS',            logo:'/assets/logos/asos.png' },
    { id:'zara',           name:'Zara',            logo:'/assets/logos/zara.png' },
    { id:'hm',             name:'H&M',             logo:'/assets/logos/hm.png' },
    { id:'uniqlo',         name:'Uniqlo',          logo:'/assets/logos/uniqlo.png' },
    { id:'aritzia',        name:'Aritzia',         logo:'/assets/logos/aritzia.png' },
    { id:'nike',           name:'Nike',            logo:'/assets/logos/nike.png' },
    { id:'adidas',         name:'Adidas',          logo:'/assets/logos/adidas.png' },
    { id:'lululemon',      name:'Lululemon',       logo:'/assets/logos/lululemon.png' },
    { id:'shein',          name:'SHEIN',           logo:'/assets/logos/shein.png' },
    { id:'abercrombie',    name:'Abercrombie',     logo:'/assets/logos/abercrombie.png' },
    { id:'hollister',      name:'Hollister',       logo:'/assets/logos/hollister.png' },
    { id:'urbanoutfitters',name:'Urban Outfitters',logo:'/assets/logos/urbanoutfitters.png' },
    { id:'ssense',         name:'SSENSE',          logo:'/assets/logos/ssense.png' },
    { id:'nordstrom',      name:'Nordstrom',       logo:'/assets/logos/nordstrom.png' },
    { id:'oldnavy',        name:'Old Navy',        logo:'/assets/logos/oldnavy.png' },
    { id:'levis',          name:"Levi's",          logo:'/assets/logos/levis.png' },
    { id:'gap',            name:'Gap',             logo:'/assets/logos/gap.png' },
  ];
</script>

<div class="chips-strip">
  {#each BRANDS as brand}
    <button
      class="chip"
      class:active={selected === brand.id}
      onclick={() => onselect(brand)}
      title={brand.name}
    >
      <img src={brand.logo} alt={brand.name} class="chip__logo" />
      <span class="chip__name">{brand.name}</span>
    </button>
  {/each}
</div>

<style>
  .chips-strip {
    display: flex; gap: 8px;
    overflow-x: auto; padding: 2px 0 6px;
    scrollbar-width: none; -webkit-overflow-scrolling: touch;
  }
  .chips-strip::-webkit-scrollbar { display: none; }

  .chip {
    display: flex; align-items: center; gap: 6px;
    flex-shrink: 0; height: 32px; padding: 0 12px 0 6px;
    background: var(--clr-cream); border: 1.5px solid var(--clr-border);
    border-radius: 999px; cursor: pointer;
    transition: background var(--dur-fast), border-color var(--dur-fast);
    font-family: var(--font-body);
  }
  .chip:hover { background: var(--clr-beige); border-color: var(--clr-light-taupe); }
  .chip.active { background: var(--clr-charcoal); border-color: var(--clr-charcoal); }
  .chip.active .chip__name { color: rgba(255,255,255,0.92); }
  .chip.active .chip__logo { filter: brightness(0) invert(1); }

  .chip__logo {
    width: 20px; height: 20px; border-radius: 50%;
    object-fit: contain; background: white; padding: 2px; flex-shrink: 0;
  }
  .chip__name {
    font-size: 12px; font-weight: 500; color: var(--clr-charcoal);
    white-space: nowrap; line-height: 1;
    transition: color var(--dur-fast);
  }
</style>
