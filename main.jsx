import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = 'http://127.0.0.1:8000';
function App() {
  const [members, setMembers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState('');
  const [member, setMember] = useState({name:'', skill:'General', capacity_per_day:10});
  const [order, setOrder] = useState({buyer:'Local buyer', product:'Handmade products', quantity:120, due_date:new Date(Date.now()+7*86400000).toISOString().slice(0,10), material_cost_per_unit:35, labour_cost_per_unit:25, overhead_total:300, margin_percent:15});
  const [selected, setSelected] = useState('');
  const [allocation, setAllocation] = useState([]);
  const [recovery, setRecovery] = useState(null);
  const [payout, setPayout] = useState(null);

  async function api(path, method='GET', body=null) {
    const res = await fetch(API+path, {method, headers:{'Content-Type':'application/json'}, body:body?JSON.stringify(body):undefined});
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }
  async function refresh() {
    try { setMembers(await api('/members')); setOrders(await api('/orders')); }
    catch(e) { setNotice('Backend not connected. Start FastAPI using the README instructions.'); }
  }
  useEffect(()=>{refresh()},[]);
  async function addMember(e) {
    e.preventDefault();
    try { await api('/members','POST',{...member,capacity_per_day:Number(member.capacity_per_day)}); setMember({...member,name:''}); setNotice('Member added.'); refresh(); }
    catch(e){setNotice(e.message)}
  }
  async function createOrder(e) {
    e.preventDefault();
    try { const data=await api('/orders','POST',{...order,quantity:Number(order.quantity),material_cost_per_unit:Number(order.material_cost_per_unit),labour_cost_per_unit:Number(order.labour_cost_per_unit),overhead_total:Number(order.overhead_total),margin_percent:Number(order.margin_percent)}); setSelected(data.id); setNotice('Order created.'); refresh(); }
    catch(e){setNotice(e.message)}
  }
  async function chooseOrder(id) {
    setSelected(id); setRecovery(null); setPayout(null);
    try { setAllocation(await api(`/orders/${id}/allocation`)); }
    catch(e){setNotice(e.message)}
  }
  async function allocate() {
    try { const d=await api('/allocate','POST',{order_id:selected}); setAllocation(d.allocation); setNotice(d.explanation); refresh(); }
    catch(e){setNotice(e.message)}
  }
  async function progress(row, value) {
    try { await api(`/orders/${selected}/members/${row.member_id}/progress`,'PATCH',{completed_quantity:Number(value)}); setAllocation(await api(`/orders/${selected}/allocation`)); setNotice('Progress updated.'); }
    catch(e){setNotice(e.message)}
  }
  async function recover() {
    try { setRecovery(await api(`/orders/${selected}/recover`,'POST',{})); }
    catch(e){setNotice(e.message)}
  }
  async function approve() {
    try { setPayout(await api(`/orders/${selected}/payout-approval`,'POST',{approved_by:'SHG Leader (demo)',approved:true})); }
    catch(e){setNotice(e.message)}
  }
  const activeOrder=orders.find(o=>o.id===selected);
  return <main>
    <header><div><div className="eyebrow">NAMMAQUAD · AGENTIC AI · PS 8.1</div><h1>Sahayak</h1><p>From scattered work to coordinated orders.</p></div><span className="pill">Hackathon prototype</span></header>
    {notice && <div className="notice" onClick={()=>setNotice('')}>{notice}　×</div>}
    <section className="grid">
      <article><h2>1. Add SHG members</h2><form onSubmit={addMember}>
        <label>Member name<input required value={member.name} onChange={e=>setMember({...member,name:e.target.value})} placeholder="e.g. Lakshmi"/></label>
        <label>Skill<input value={member.skill} onChange={e=>setMember({...member,skill:e.target.value})}/></label>
        <label>Capacity per day (units)<input type="number" min="1" value={member.capacity_per_day} onChange={e=>setMember({...member,capacity_per_day:e.target.value})}/></label>
        <button>Add member</button></form>
        <div className="chips">{members.map(m=><span key={m.id}>{m.name} · {m.capacity_per_day}/day</span>)}</div>
      </article>
      <article><h2>2. Create bulk order</h2><form onSubmit={createOrder}>
        <label>Buyer<input value={order.buyer} onChange={e=>setOrder({...order,buyer:e.target.value})}/></label>
        <label>Product<input value={order.product} onChange={e=>setOrder({...order,product:e.target.value})}/></label>
        <label>Quantity<input type="number" min="1" value={order.quantity} onChange={e=>setOrder({...order,quantity:e.target.value})}/></label>
        <label>Due date<input type="date" value={order.due_date} onChange={e=>setOrder({...order,due_date:e.target.value})}/></label>
        <div className="row">
          <label>Material/unit ₹<input type="number" min="0" value={order.material_cost_per_unit} onChange={e=>setOrder({...order,material_cost_per_unit:e.target.value})}/></label>
          <label>Labour/unit ₹<input type="number" min="0" value={order.labour_cost_per_unit} onChange={e=>setOrder({...order,labour_cost_per_unit:e.target.value})}/></label>
        </div>
        <div className="row">
          <label>Overhead ₹<input type="number" min="0" value={order.overhead_total} onChange={e=>setOrder({...order,overhead_total:e.target.value})}/></label>
          <label>Margin %<input type="number" min="0" value={order.margin_percent} onChange={e=>setOrder({...order,margin_percent:e.target.value})}/></label>
        </div>
        <button>Create order & calculate price</button></form>
      </article>
    </section>
    <section className="panel"><h2>3. Order workspace</h2>
      <select value={selected} onChange={e=>chooseOrder(e.target.value)}><option value="">Select an order</option>{orders.map(o=><option value={o.id} key={o.id}>{o.product} · {o.quantity} units · #{o.id}</option>)}</select>
      {activeOrder && <div className="summary"><div><small>Estimated cost</small><strong>₹{activeOrder.estimated_cost}</strong></div><div><small>Quoted total</small><strong>₹{activeOrder.quoted_total}</strong></div><div><small>Unit price</small><strong>₹{activeOrder.quoted_unit_price}</strong></div></div>}
      <div className="actions"><button disabled={!selected||!members.length} onClick={allocate}>Allocate work</button><button className="secondary" disabled={!selected||!allocation.length} onClick={recover}>Check risk / recover order</button><button className="secondary" disabled={!selected||!allocation.length} onClick={approve}>Leader approves demo payout</button></div>
      {allocation.map(r=><div className="workrow" key={r.member_id}><div><b>{r.member_name}</b><small>{r.completed_quantity} of {r.assigned_quantity} completed · {r.status}</small></div><input aria-label="Completed units" type="number" min="0" max={r.assigned_quantity} value={r.completed_quantity} onChange={e=>progress(r,e.target.value)}/></div>)}
      {recovery && <div className="callout"><b>Order recovery assessment: {recovery.risk}</b><p>{recovery.message}</p>{recovery.proposal?.map(p=><div>{p.member_name}: proposed +{p.additional_quantity} units</div>)}<small>Proposal only — no reassignment is applied without leader approval.</small></div>}
      {payout && <div className="callout"><b>{payout.status}</b><p>{payout.note}</p><p>Illustrative labour pool: ₹{payout.illustrative_labour_pool}</p></div>}
    </section>
    <footer>Sahayak · Transparent costing · Explainable allocation · Human-approved payouts</footer>
  </main>
}
createRoot(document.getElementById('root')).render(<App/>);
