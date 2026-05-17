import sys
sys.path.insert(0, "/home/ubuntu/elder_backend")

import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import directly
import importlib.util
spec = importlib.util.spec_from_file_location("main", "/home/ubuntu/elder_backend/remote-main.py")
main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main)

DATABASE_URL = "sqlite:////home/ubuntu/elder_backend/elder_care.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

inst_id = "demo-qinghe-care"
record_date = "2026-05-10"

# Check what generate_tasks_for_date sees
from remote_main import ElderTable, CaregiverTable, InstitutionStateTable, PublishedTaskTable

elders_all = db.query(ElderTable).filter(ElderTable.institution_id == inst_id).all()
caregivers_all = db.query(CaregiverTable).filter(CaregiverTable.institution_id == inst_id).all()
inst_state = db.query(InstitutionStateTable).filter(InstitutionStateTable.institution_id == inst_id).first()

print(f"ElderTable: {len(elders_all)} rows")
print(f"CaregiverTable: {len(caregivers_all)} rows")
print(f"InstitutionState: {'found' if inst_state else 'None'}")
if inst_state:
    print(f"  personnel_info type: {type(inst_state.personnel_info).__name__}")
    pi = inst_state.personnel_info or {}
    print(f"  personnel_info keys: {list(pi.keys()) if isinstance(pi, dict) else 'NOT DICT'}")
    cgs = pi.get("caregivers", []) if isinstance(pi, dict) else []
    print(f"  caregivers count: {len(cgs)}")
    for cg in cgs[:3]:
        print(f"    {cg.get('id','?')} | {cg.get('name','?')} | floor={cg.get('floor','?')}")

db.close()
