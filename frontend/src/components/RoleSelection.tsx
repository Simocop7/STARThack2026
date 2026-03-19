type Role = "employee" | "office";

interface Props {
  onSelect: (role: Role) => void;
}

export default function RoleSelection({ onSelect }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-white font-bold text-2xl">SP</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Smart Procurement</h1>
          <p className="mt-2 text-gray-500">Select your role to continue</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Employee card */}
          <button
            onClick={() => onSelect("employee")}
            className="group bg-white border-2 border-gray-200 rounded-2xl p-8 text-left hover:border-blue-500 hover:shadow-lg transition-all duration-200"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-600 transition-colors">
              <svg className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Employee</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Submit a new procurement request. Describe what you need and we'll handle the rest.
            </p>
            <div className="mt-6 flex items-center text-blue-600 text-sm font-medium">
              Submit a request
              <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          {/* Procurement Office card */}
          <button
            onClick={() => onSelect("office")}
            className="group bg-white border-2 border-gray-200 rounded-2xl p-8 text-left hover:border-indigo-500 hover:shadow-lg transition-all duration-200"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-600 transition-colors">
              <svg className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Procurement Office</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Review incoming requests, validate, rank suppliers, and place orders on behalf of the organisation.
            </p>
            <div className="mt-6 flex items-center text-indigo-600 text-sm font-medium">
              Open office dashboard
              <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
