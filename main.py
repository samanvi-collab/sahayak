from datetime import date
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Sahayak API", version="0.1.0",
              description="Hackathon prototype for SHG order fulfilment.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    skill: str = "General"
    capacity_per_day: int = Field(gt=0, le=10000)

class Member(MemberIn):
    id: str
    active: bool = True

class OrderIn(BaseModel):
    buyer: str = Field(min_length=1, max_length=100)
    product: str = Field(min_length=1, max_length=100)
    quantity: int = Field(gt=0, le=100000)
    due_date: date
    material_cost_per_unit: float = Field(ge=0)
    labour_cost_per_unit: float = Field(ge=0)
    overhead_total: float = Field(ge=0)
    margin_percent: float = Field(ge=0, le=200)

class AllocationIn(BaseModel):
    order_id: str

class ProgressIn(BaseModel):
    completed_quantity: int = Field(ge=0)

class ApprovalIn(BaseModel):
    approved_by: str = Field(min_length=1, max_length=80)
    approved: bool

members: Dict[str, Member] = {}
orders: Dict[str, dict] = {}
allocations: Dict[str, list] = {}
payouts: Dict[str, dict] = {}

@app.get("/")
def health():
    return {"app": "Sahayak", "status": "running", "mode": "hackathon-demo"}

@app.get("/members", response_model=List[Member])
def list_members():
    return list(members.values())

@app.post("/members", response_model=Member)
def add_member(payload: MemberIn):
    member = Member(id=str(uuid4())[:8], **payload.model_dump())
    members[member.id] = member
    return member

@app.get("/orders")
def list_orders():
    return list(orders.values())

@app.post("/orders")
def create_order(payload: OrderIn):
    order_id = str(uuid4())[:8]
    base = payload.material_cost_per_unit + payload.labour_cost_per_unit
    subtotal = base * payload.quantity + payload.overhead_total
    total = round(subtotal * (1 + payload.margin_percent / 100), 2)
    order = {
        "id": order_id, **payload.model_dump(mode="json"),
        "estimated_cost": round(subtotal, 2),
        "quoted_total": total,
        "quoted_unit_price": round(total / payload.quantity, 2),
        "status": "created",
    }
    orders[order_id] = order
    return order

@app.post("/allocate")
def allocate(payload: AllocationIn):
    order = orders.get(payload.order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    active = [m for m in members.values() if m.active]
    if not active:
        raise HTTPException(400, "Add at least one active member first")

    # Transparent capacity-weighted allocation. Each member receives a share
    # proportional to their stated daily capacity; the final member gets remainder.
    total_capacity = sum(m.capacity_per_day for m in active)
    remaining = order["quantity"]
    result = []
    for idx, member in enumerate(active):
        if idx == len(active) - 1:
            qty = remaining
        else:
            qty = round(order["quantity"] * member.capacity_per_day / total_capacity)
            qty = min(qty, remaining)
        remaining -= qty
        result.append({
            "member_id": member.id, "member_name": member.name,
            "assigned_quantity": qty, "completed_quantity": 0,
            "status": "assigned",
        })
    allocations[order["id"]] = result
    order["status"] = "allocated"
    return {"order_id": order["id"], "allocation": result,
            "explanation": "Work is split in proportion to each active member's stated capacity."}

@app.get("/orders/{order_id}/allocation")
def get_allocation(order_id: str):
    if order_id not in orders:
        raise HTTPException(404, "Order not found")
    return allocations.get(order_id, [])

@app.patch("/orders/{order_id}/members/{member_id}/progress")
def update_progress(order_id: str, member_id: str, payload: ProgressIn):
    if order_id not in orders:
        raise HTTPException(404, "Order not found")
    rows = allocations.get(order_id, [])
    row = next((r for r in rows if r["member_id"] == member_id), None)
    if row is None:
        raise HTTPException(404, "Member allocation not found")
    if payload.completed_quantity > row["assigned_quantity"]:
        raise HTTPException(400, "Completed quantity cannot exceed assigned quantity")
    row["completed_quantity"] = payload.completed_quantity
    row["status"] = "complete" if payload.completed_quantity == row["assigned_quantity"] else "in_progress"
    return row

@app.post("/orders/{order_id}/recover")
def recover_order(order_id: str):
    if order_id not in orders:
        raise HTTPException(404, "Order not found")
    rows = allocations.get(order_id, [])
    if not rows:
        raise HTTPException(400, "Allocate the order first")
    incomplete = [r for r in rows if r["assigned_quantity"] > r["completed_quantity"]]
    if not incomplete:
        return {"risk": "none", "message": "All assigned work is complete.", "proposal": []}

    # Demo rule: identify the largest remaining workload and redistribute it
    # across other members who have spare assigned capacity (not a prediction).
    at_risk = max(incomplete, key=lambda r: r["assigned_quantity"] - r["completed_quantity"])
    remaining = at_risk["assigned_quantity"] - at_risk["completed_quantity"]
    receivers = [r for r in rows if r["member_id"] != at_risk["member_id"]]
    proposal = []
    if receivers:
        split = remaining // len(receivers)
        extra = remaining % len(receivers)
        for i, receiver in enumerate(receivers):
            qty = split + (1 if i < extra else 0)
            if qty:
                proposal.append({
                    "member_id": receiver["member_id"],
                    "member_name": receiver["member_name"],
                    "additional_quantity": qty,
                })
    return {
        "risk": "review_needed",
        "message": f"{at_risk['member_name']} has {remaining} units remaining. This is a demo recovery proposal; leader approval is required.",
        "member_needing_support": at_risk["member_name"],
        "remaining_quantity": remaining,
        "proposal": proposal,
        "requires_leader_approval": True,
    }

@app.post("/orders/{order_id}/payout-approval")
def approve_payout(order_id: str, payload: ApprovalIn):
    if order_id not in orders:
        raise HTTPException(404, "Order not found")
    rows = allocations.get(order_id, [])
    total_done = sum(r["completed_quantity"] for r in rows)
    # Illustrative labour split based on completed units.
    labour_pool = orders[order_id]["labour_cost_per_unit"] * total_done
    result = {
        "order_id": order_id,
        "approved": payload.approved,
        "approved_by": payload.approved_by,
        "completed_units": total_done,
        "illustrative_labour_pool": round(labour_pool, 2),
        "status": "approved_demo_record" if payload.approved else "pending",
        "note": "No money moved. This records the leader's demo approval only.",
    }
    payouts[order_id] = result
    return result

@app.get("/orders/{order_id}/payout")
def get_payout(order_id: str):
    if order_id not in orders:
        raise HTTPException(404, "Order not found")
    return payouts.get(order_id, {"status": "not_submitted"})
