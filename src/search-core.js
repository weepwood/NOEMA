/* NOEMA Search Core: unified ranking and filtering over title, path and category. */
(function (root) {
  'use strict';
  const normalize = text => String(text ?? '').normalize('NFKC').toLocaleLowerCase().trim();
  function rank(art, phrase) {
    if (!phrase) return 4;
    const terms=phrase.split(/\s+/).filter(Boolean);
    const title=normalize(art.title), path=normalize(art.desc), category=normalize(art.category);
    if (!terms.every(term=>title.includes(term)||path.includes(term)||category.includes(term))) return -1;
    if(title===phrase)return 0;
    if(title.startsWith(phrase))return 1;
    if(title.includes(phrase))return 2;
    return 3;
  }
  function search(items, text, limit=40) {
    const phrase=normalize(text), found=[];let total=0;
    for(let i=0;i<items.length;i++){
      const score=rank(items[i],phrase);
      if(score<0)continue;
      total++;
      if(limit<=0)continue;
      // Keep the best K across the entire collection, not merely the first K.
      const candidate={index:i,art:items[i],rank:score};
      let lo=0,hi=found.length;
      while(lo<hi){const mid=(lo+hi)>>1,prev=found[mid];
        if(prev.rank<score||(prev.rank===score&&prev.index<i))lo=mid+1;else hi=mid}
      if(lo<limit){found.splice(lo,0,candidate);if(found.length>limit)found.pop()}
    }
    return {found,total};
  }
  const filter = (items,text) => {
    const phrase=normalize(text);
    return phrase?items.filter(item=>rank(item,phrase)>=0):items.slice();
  };
  root.NOEMASearchCore=Object.freeze({normalize,rank,search,filter});
})(typeof window === 'undefined' ? globalThis : window);
