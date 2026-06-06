<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  // Auth now lives in the landing page modal - redirect there
  onMount(() => goto('/'));
</script>
