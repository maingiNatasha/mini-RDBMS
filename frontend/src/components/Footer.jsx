function Footer() {
    return (
        <footer className="w-full py-6 text-center text-gray-600">
            <p className="text-sm">
                © {new Date().getFullYear()} Task Manager Demo — All rights reserved.
            </p>
        </footer>
    );
}

export default Footer