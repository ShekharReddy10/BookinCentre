"""Add iCal feeds (Airbnb/Booking.com/etc listing calendar URLs) from the shell.

Each feed represents a room CATEGORY (AC or Non-AC) within a cluster, not one
physical room — a matching free room gets auto-allocated per booking that
syncs in. Runs against whatever DATABASE_URL is set in backend/.env (points
at production Supabase by default in this project).

Give each feed a `label` (e.g. "Account 2 - AC Listing") so you can tell
apart multiple feeds pointing at the same cluster+category, and optionally
attach it to a team member (`managed_by_email`) so you know whose account a
feed belongs to. The user must already exist (create them first via
Admin -> Users or `python -m app.create_user`) — a feed can't be mapped to a
user that doesn't exist yet.

Usage:
  # See your cluster names/ids and team member emails first
  python -m app.add_ical_feed --list-clusters
  python -m app.add_ical_feed --list-users

  # Edit the FEEDS list in app/ical_feeds_data.py, then just run:
  python -m app.add_ical_feed

  # Or add a single one without touching that file:
  python -m app.add_ical_feed --cluster "Royal Stay" --category ac --source airbnb \
      --label "Account 2 - AC Listing" --managed-by-email rahul@example.com \
      --url "https://www.airbnb.co.in/calendar/ical/....ics?t=..."
"""
import argparse

from app.database import Base, SessionLocal, engine
from app.models import BookingSource, Cluster, ICalFeed, User

Base.metadata.create_all(bind=engine)

VALID_SOURCES = [s.value for s in BookingSource]


def list_clusters():
    db = SessionLocal()
    try:
        clusters = db.query(Cluster).order_by(Cluster.name).all()
        if not clusters:
            print("No clusters found. Create one first via Admin -> Clusters in the app.")
            return
        print(f"{'Name':<30} {'Location':<30} ID")
        for c in clusters:
            print(f"{c.name:<30} {(c.location or '-'):<30} {c.id}")
    finally:
        db.close()


def list_users():
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.name).all()
        if not users:
            print("No users found.")
            return
        print(f"{'Name':<25} {'Email':<35} Role")
        for u in users:
            print(f"{u.name:<25} {u.email:<35} {u.role.value}")
    finally:
        db.close()


def add_feed(
    cluster_name: str,
    category: str,
    source: str,
    url: str,
    label: str | None = None,
    managed_by_email: str | None = None,
) -> bool:
    has_ac = category.strip().lower() in ("ac", "true", "yes", "1")
    category_label = "AC" if has_ac else "Non-AC"
    source = source.strip().lower()
    if source not in VALID_SOURCES:
        print(f"  SKIP: unknown source '{source}'. Valid: {', '.join(VALID_SOURCES)}")
        return False

    db = SessionLocal()
    try:
        cluster = db.query(Cluster).filter(Cluster.name == cluster_name).first()
        if not cluster:
            print(f"  SKIP: no cluster named '{cluster_name}'. Run --list-clusters to see valid names.")
            return False

        managed_by_user_id = None
        if managed_by_email:
            user = db.query(User).filter(User.email == managed_by_email).first()
            if not user:
                print(
                    f"  SKIP: no user with email '{managed_by_email}'. "
                    f"Create them first (Admin -> Users or `python -m app.create_user`), "
                    f"or run --list-users to see who already exists."
                )
                return False
            managed_by_user_id = user.id

        if db.query(ICalFeed).filter(ICalFeed.url == url).first():
            print(f"  SKIP: a feed with this URL already exists -> {url[:60]}...")
            return False

        feed = ICalFeed(
            label=label or None,
            cluster_id=cluster.id,
            managed_by_user_id=managed_by_user_id,
            has_ac=has_ac,
            source=BookingSource(source),
            url=url,
        )
        db.add(feed)
        db.commit()
        name = f"{label} " if label else ""
        owner = f" (managed by {managed_by_email})" if managed_by_email else ""
        print(f"  Added: {name}({cluster.name} / {category_label} / {source}){owner} -> {url[:60]}...")
        return True
    finally:
        db.close()


def add_from_dict_list():
    from app.ical_feeds_data import FEEDS

    if not FEEDS:
        print("app/ical_feeds_data.py has an empty FEEDS list — add your entries there first.")
        return

    added = 0
    for entry in FEEDS:
        if add_feed(
            entry["cluster"],
            entry["category"],
            entry["source"],
            entry["url"],
            entry.get("label"),
            entry.get("managed_by_email"),
        ):
            added += 1
    print(f"\nDone. Added {added}/{len(FEEDS)} feed(s).")


def main():
    parser = argparse.ArgumentParser(description="Add iCal feeds from the shell.")
    parser.add_argument("--list-clusters", action="store_true", help="List cluster names/ids and exit")
    parser.add_argument("--list-users", action="store_true", help="List team member names/emails and exit")
    parser.add_argument("--cluster", help="Cluster name (exact match, case-sensitive)")
    parser.add_argument("--category", choices=["ac", "nonac"], help="Room category this listing represents")
    parser.add_argument("--source", choices=VALID_SOURCES, help="Booking platform")
    parser.add_argument("--url", help="Calendar export (.ics) URL")
    parser.add_argument("--label", help="Name to tell this feed apart from others (e.g. 'Account 2 - AC Listing')")
    parser.add_argument("--managed-by-email", help="Email of the existing team member this account belongs to")
    args = parser.parse_args()

    if args.list_clusters:
        list_clusters()
        return

    if args.list_users:
        list_users()
        return

    if args.cluster and args.category and args.source and args.url:
        add_feed(args.cluster, args.category, args.source, args.url, args.label, args.managed_by_email)
        return

    add_from_dict_list()


if __name__ == "__main__":
    main()
