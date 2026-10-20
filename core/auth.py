"""
DocuMind Centralized Authentication & User Isolation Helpers.
Provides get_current_user_id() and @login_required decorator.
"""

from functools import wraps
from flask import session, request, jsonify, redirect, url_for


def get_current_user_id() -> int | None:
    """
    Centralized helper to safely get the current authenticated user's ID from session.
    Never trusts user_id from request body, query parameters, or form data.
    """
    user_id = session.get('user_id')
    if user_id:
        try:
            return int(user_id)
        except (ValueError, TypeError):
            pass

    user = session.get('user')
    if isinstance(user, dict) and user.get('id'):
        try:
            uid = int(user['id'])
            session['user_id'] = uid  # Synchronize session key
            return uid
        except (ValueError, TypeError):
            pass

    return None


def login_required(f):
    """
    Decorator that verifies the user is authenticated via session.
    Returns 401 JSON for /api/ routes and redirects to /login for HTML pages.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = get_current_user_id()
        if not user_id:
            if request.path.startswith('/api/'):
                return jsonify({
                    'status': 'error',
                    'message': 'Authentication required. Please sign in.'
                }), 401
            return redirect(url_for('main.login'))
        return f(*args, **kwargs)
    return decorated_function
