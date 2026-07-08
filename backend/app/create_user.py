"""Create (or reset) a user account from the shell and print the credentials to share with them.

Usage:
  python -m app.create_user --name "Rahul" --email rahul@bcc-demo.com --role manager --phone 8888888888
  python -m app.create_user --email rahul@bcc-demo.com --reset-password

Roles: admin, manager, staff
"""
import argparse

from app.auth import generate_temp_password, hash_password
from app.database import Base, SessionLocal, engine
from app.models import User, UserRole

Base.metadata.create_all(bind=engine)


def main():
    parser = argparse.ArgumentParser(description="Create or reset a Booking Control Center user account.")
    parser.add_argument("--name", help="Full name (required when creating)")
    parser.add_argument("--email", required=True, help="Login email")
    parser.add_argument("--phone", help="Phone number")
    parser.add_argument("--role", choices=[r.value for r in UserRole], default=UserRole.staff.value)
    parser.add_argument("--reset-password", action="store_true", help="Reset password for an existing user instead of creating one")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == args.email).first()
        temp_password = generate_temp_password()

        if args.reset_password:
            if not existing:
                print(f"No user found with email {args.email}")
                return
            existing.hashed_password = hash_password(temp_password)
            existing.must_change_password = True
            db.commit()
            print(f"Password reset for {existing.name} <{existing.email}>")
            print(f"Temporary password: {temp_password}")
            return

        if existing:
            print(f"A user with email {args.email} already exists. Use --reset-password to issue a new password.")
            return

        if not args.name:
            print("--name is required when creating a new user")
            return

        user = User(
            name=args.name,
            email=args.email,
            phone=args.phone,
            role=UserRole(args.role),
            hashed_password=hash_password(temp_password),
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"Created {user.role.value} account: {user.name} <{user.email}>")
        print(f"Temporary password: {temp_password}")
        print("Share this with the user directly — they'll be asked to set a new password on first login.")
        print("Assign cluster access from the Admin > Users page in the app.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
