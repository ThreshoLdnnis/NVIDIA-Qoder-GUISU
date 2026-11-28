(() => {
  'use strict';

  const menu = document.querySelector('.mobile-menu');
  const nav = document.querySelector('#site-nav');
  const setMenu = open => {
    menu.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  };
  if (menu && nav) {
    menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menu.focus();
      }
    });
  }

  function addMaterialControls(data) {
    const tabs = [...document.querySelectorAll('[data-mat]')];
    const fields = [...document.querySelectorAll('[data-field]')];
    const source = document.querySelector('#material-json');
    const show = id => {
      const material = data.materials.find(row => row.id === id);
      if (!material) return;
      tabs.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mat === id)));
      fields.forEach(field => {
        const key = field.dataset.field;
        field.textContent = key === 'quantity' ? `${material.quantity} 件` : material[key];
      });
      source.textContent = JSON.stringify(material, null, 2);
    };
    tabs.forEach(button => button.addEventListener('click', () => show(button.dataset.mat)));
    show(tabs[0].dataset.mat);
  }

  function addDesignControls(data) {
    const tabs = [...document.querySelectorAll('[data-plan]')];
    const slider = document.querySelector('#bolt-slider');
    const initial = data.materials.find(row => row.id === 'MAT-F01').quantity;
    const texts = Object.fromEntries(['bolt-value', 'bolt-required', 'bolt-available', 'bolt-gap', 'plan-explanation', 'plan-note'].map(id => [id, document.getElementById(id)]));
    let selected = tabs[0].dataset.plan;
    slider.value = String(initial);
    const show = () => {
      const plan = data.plans.find(row => row.id === selected);
      const required = plan.requirements['MAT-F01'];
      const available = slider.valueAsNumber;
      const gap = Math.max(0, required - available);
      slider.setAttribute('aria-valuetext', `${available} 枚`);
      tabs.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.plan === selected)));
      texts['bolt-value'].textContent = `${available} 枚`;
      texts['bolt-required'].textContent = required;
      texts['bolt-available'].textContent = available;
      texts['bolt-gap'].textContent = gap;
      texts['plan-explanation'].textContent = `${plan.description}。`;
      texts['plan-note'].textContent = gap > 0
        ? `螺栓缺 ${gap} 枚，可补料或比较另一方案。其他部件按初始示例库存。`
        : '螺栓数量满足。尺寸、结构、连接和工艺仍需单独复核。';
    };
    slider.addEventListener('input', show);
    tabs.forEach(button => button.addEventListener('click', () => {
      selected = button.dataset.plan;
      show();
    }));
    show();
  }

  const hasMaterials = Boolean(document.querySelector('[data-mat]'));
  const hasDesign = Boolean(document.querySelector('[data-plan]'));
  if (hasMaterials || hasDesign) {
    const start = data => {
      if (hasMaterials) addMaterialControls(data);
      if (hasDesign) addDesignControls(data);
    };
    const fallback = () => {
      const script = document.createElement('script');
      script.src = 'workbench/data/sample-case.js';
      script.onload = () => {
        const data = window.REFORM_CASE_FALLBACK;
        if (data) start(data);
        else fail();
      };
      script.onerror = fail;
      document.head.append(script);
    };
    function fail() {
      document.querySelectorAll('[data-mat],[data-plan],#bolt-slider').forEach(control => control.disabled = true);
      const target = document.querySelector('[data-field=risk],#plan-note');
      if (target) target.textContent = '示例数据暂未载入，请刷新页面，或通过工作台查看案例。';
    }
    fetch('workbench/data/sample-case.json').then(response => {
      if (!response.ok) throw new Error('Unable to load sample case');
      return response.json();
    }).then(start).catch(fallback);
  }

  const galleryPhoto = document.querySelector('#gallery-photo');
  if (galleryPhoto) {
    const titles = ['原材料', '预设方案', '装配预演', '档案记录'];
    const captions = [
      '以一块旧木板、四个金属角码、两件电子外壳和六枚螺栓建立示例库存。',
      '候选方案沿用同一批材料。框架优先需八枚螺栓，模块优先需六枚。',
      '装配步骤引用所选方案及部件编号，保留实际制作前的检查点。',
      '档案记录材料、库存、方案与缺口；真实试制后可补充照片、余料和修改记录。'
    ];
    const buttons = [...document.querySelectorAll('[data-gallery]')];
    const dialog = document.querySelector('#photo-dialog');
    const photoLarge = document.querySelector('#photo-large');
    const opener = document.querySelector('#open-photo');
    buttons.forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.gallery);
      buttons.forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
      galleryPhoto.src = button.dataset.photo;
      galleryPhoto.alt = button.dataset.alt;
      document.querySelector('#gallery-title').textContent = titles[index];
      document.querySelector('#gallery-copy').textContent = captions[index];
    }));
    opener.addEventListener('click', () => {
      photoLarge.src = galleryPhoto.src;
      photoLarge.alt = galleryPhoto.alt;
      dialog.showModal();
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => opener.focus());
  }

  const motionDetails = document.querySelector('#assembly-motion');
  if (motionDetails) {
    const preview = motionDetails.querySelector('img');
    const still = preview.getAttribute('src');
    motionDetails.addEventListener('toggle', () => {
      preview.src = motionDetails.open ? preview.dataset.motionSrc : still;
    });
  }
})();
